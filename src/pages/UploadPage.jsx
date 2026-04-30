import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { supabase } from "../supabase";
import { ActionCard, InsightCard, MiniCard, Row, Section } from "../components/ui";
import {
  formatDateRange,
  getImportFingerprint,
  getImportOverlapSummary,
  getTransactionConfidence,
  summariseRowsForImport,
} from "../lib/importAnalysis";
import { buildUploadGuidance } from "../lib/uploadGuidance";
import { getTotals, normalizeText } from "../lib/finance";

export default function UploadPage({
  accounts,
  statementImports,
  existingTransactions,
  onImportDone,
  onGoToCoach,
  screenWidth,
  styles,
  helpers,
}) {
  const {
    enhanceTransactions,
    getGridStyle,
    getHistorySummary,
    getRecurringSummary,
    getStatusPillStyle,
    getTransferSummary,
  } = helpers;

  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showUploadHint, setShowUploadHint] = useState(false);
  const uploadGuidance = useMemo(
    () => buildUploadGuidance({ statementImports, existingTransactions }),
    [statementImports, existingTransactions]
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const shouldHighlight = sessionStorage.getItem("moneyhub-highlight-upload") === "true";
    if (!shouldHighlight) return undefined;

    sessionStorage.removeItem("moneyhub-highlight-upload");
    const showTimer = window.setTimeout(() => setShowUploadHint(true), 0);
    const hideTimer = window.setTimeout(() => setShowUploadHint(false), 7000);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  function cleanAmount(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return Number.NaN;

    const isNegative =
      raw.startsWith("-") ||
      raw.endsWith("-") ||
      /^\(.*\)$/.test(raw) ||
      /\bdr\b/i.test(raw) ||
      /money out/i.test(raw);

    const cleaned = raw
      .replace(/[£$€,]/g, "")
      .replace(/[()]/g, "")
      .replace(/\bcr\b/gi, "")
      .replace(/\bdr\b/gi, "")
      .replace(/[^0-9.-]/g, "")
      .trim();

    if (!cleaned) return Number.NaN;

    const parsed = Number(cleaned);
    if (Number.isNaN(parsed)) return Number.NaN;
    return isNegative ? -Math.abs(parsed) : parsed;
  }

  function guessAccountName(name) {
    const lower = String(name || "").toLowerCase();

    if (lower.includes("monzo")) return "Monzo Current";
    if (lower.includes("halifax")) return "Halifax";
    if (lower.includes("barclays")) return "Barclays";
    if (lower.includes("lloyds")) return "Lloyds";
    if (lower.includes("santander")) return "Santander";
    if (lower.includes("natwest")) return "NatWest";
    if (lower.includes("revolut")) return "Revolut";
    if (lower.includes("starling")) return "Starling";
    if (lower.includes("savings")) return "Savings Account";

    return "";
  }

  function guessInstitution(name) {
    const guessed = guessAccountName(name);
    return guessed ? guessed.split(" ")[0] : "Imported";
  }

  function makeDuplicateKey(row, accountId) {
    return `${accountId}-${row.date}-${row.description}-${row.amount}`
      .toLowerCase()
      .replace(/\s+/g, "-");
  }

  function normalizeDescription(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function normalizeHeaderKey(key) {
    return String(key || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function getFirstRowValue(row, ...keys) {
    const rowEntries = Object.entries(row || {});
    const normalizedEntries = rowEntries.map(([key, value]) => [
      normalizeHeaderKey(key),
      value,
    ]);

    for (const key of keys) {
      if (!key) continue;
      const directValue = row[key];
      if (directValue !== undefined && directValue !== null && String(directValue).trim() !== "") {
        return directValue;
      }

      const normalizedKey = normalizeHeaderKey(key);
      const matched = normalizedEntries.find(([candidateKey]) => candidateKey === normalizedKey);
      const value = matched?.[1];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return value;
      }
    }

    return "";
  }

  function detectHeaderRowIndex(chunk) {
    const lines = chunk.split(/\r?\n/);

    return lines.findIndex((line) => {
      const lower = line.toLowerCase();
      return (
        lower.includes("date") &&
        (lower.includes("description") || lower.includes("merchant") || lower.includes("payee")) &&
        (lower.includes("amount") || lower.includes("money in") || lower.includes("money out"))
      );
    });
  }

  async function requestCsvMapping(headers, sampleRows) {
    try {
      const { data, error } = await supabase.functions.invoke("swift-worker", {
        body: { headers, sampleRows },
      });

      if (error) {
        console.error("AI mapping failed:", error);
        return null;
      }

      return data || null;
    } catch (error) {
      console.error("AI mapping request failed:", error);
      return null;
    }
  }

  function resolveImportedAmount(row, mapping) {
    const mappedSignedAmount = getFirstRowValue(row, mapping?.amount);

    if (mappedSignedAmount !== "") {
      return cleanAmount(mappedSignedAmount);
    }

    const moneyIn = getFirstRowValue(
      row,
      mapping?.money_in,
      "Money In",
      "Money in",
      "money_in",
      "Credit",
      "Credit Amount",
      "CreditAmount",
      "Paid In",
      "Paid in",
      "PaidIn",
      "In",
      "Deposit"
    );
    const moneyOut = getFirstRowValue(
      row,
      mapping?.money_out,
      "Money Out",
      "Money out",
      "money_out",
      "Debit",
      "Debit Amount",
      "DebitAmount",
      "Paid Out",
      "Paid out",
      "PaidOut",
      "Out",
      "Withdrawal"
    );

    const parsedMoneyIn = moneyIn !== "" ? Math.abs(cleanAmount(moneyIn)) : Number.NaN;
    const parsedMoneyOut = moneyOut !== "" ? Math.abs(cleanAmount(moneyOut)) : Number.NaN;

    if (!Number.isNaN(parsedMoneyIn) && parsedMoneyIn > 0) {
      return parsedMoneyIn;
    }

    if (!Number.isNaN(parsedMoneyOut) && parsedMoneyOut > 0) {
      return -parsedMoneyOut;
    }

    if (!Number.isNaN(parsedMoneyIn)) {
      return parsedMoneyIn;
    }

    if (!Number.isNaN(parsedMoneyOut)) {
      return -parsedMoneyOut;
    }

    const signedAmount = getFirstRowValue(
      row,
      "Amount",
      "amount",
      "Transaction Amount",
      "TransactionAmount",
      "Signed Amount",
      "Value",
      "Transaction Value"
    );

    if (signedAmount !== "") {
      return cleanAmount(signedAmount);
    }

    return Number.NaN;
  }

  function getUniqueRowParts(row, ...keys) {
    const seen = new Set();
    return keys
      .map((key) => getFirstRowValue(row, key))
      .map((value) => normalizeDescription(value))
      .filter((value) => {
        if (!value) return false;
        const normalized = normalizeHeaderKey(value);
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
  }

  function buildImportedDescription(row, mapping) {
    const parts = getUniqueRowParts(
      row,
      mapping?.description,
      mapping?.payee,
      mapping?.reference,
      "Transaction Description",
      "Description",
      "description",
      "Details",
      "Narrative",
      "Transaction Narrative",
      "Payee",
      "Recipient",
      "Beneficiary",
      "Counterparty",
      "Counter Party",
      "Counterparty Name",
      "Name",
      "Paid To",
      "Paid From",
      "Reference",
      "Payment Reference",
      "Customer Reference",
      "Memo",
      "Notes"
    );

    return parts.join(" | ");
  }

  const categoryRules = [
    { category: "Income", test: ({ text, amount }) => amount > 0 && /salary|payroll|wage|paye|bonus|hmrc/.test(text) },
    { category: "Internal Transfer", test: ({ text }) => /transfer to|transfer from|to savings|from savings|standing order to|between accounts|own account/.test(text) },
    { category: "Bill", test: ({ text }) => /rent|council|electric|gas|water|mortgage|broadband|internet|virgin media|sky|bt/.test(text) },
    { category: "Subscription", test: ({ text }) => /netflix|spotify|prime|apple|google|disney|adobe|icloud|youtube premium/.test(text) },
    { category: "Groceries", test: ({ text }) => /tesco|aldi|lidl|asda|sainsbury|waitrose|morrisons|co-op/.test(text) },
    { category: "Fuel", test: ({ text }) => /shell|bp|esso|texaco/.test(text) },
    { category: "Treats", test: ({ text }) => /costa|mcdonald|kfc|greggs|starbucks/.test(text) },
    { category: "Takeaway", test: ({ text }) => /deliveroo|uber eats|just eat|domino/.test(text) },
    { category: "Shopping", test: ({ text }) => /amazon|etsy|ebay|argos/.test(text) },
    { category: "Transport", test: ({ text }) => /uber|trainline|tfl|national rail|bus|petrol station/.test(text) },
  ];

  function detectCategory(description, amount) {
    const text = normalizeDescription(description).toLowerCase();
    const matchedRule = categoryRules.find((rule) => rule.test({ text, amount }));
    if (matchedRule) return matchedRule.category;
    return amount > 0 ? "Income" : "Spending";
  }

  function summarizeMappingQuality(headers, mapping) {
    if (!headers.length) {
      return {
        label: "Fallback only",
        headline: "No header shape detected yet",
        body: "The import will rely on generic fallbacks until a usable header row is found.",
        confidence: 0.4,
      };
    }

    const matchedFields = ["date", "description", "amount", "money_in", "money_out"].filter(
      (field) => mapping?.[field] && headers.includes(mapping[field])
    );
    const coreFields = ["date", "description"].filter(
      (field) => mapping?.[field] && headers.includes(mapping[field])
    ).length;
    const amountFields = ["amount", "money_in", "money_out"].filter(
      (field) => mapping?.[field] && headers.includes(mapping[field])
    ).length;

    if (coreFields === 2 && amountFields >= 1) {
      return {
        label: "AI + fallback",
        headline: `Mapped ${matchedFields.length} useful columns cleanly`,
        body: "The file shape looks understandable, so the import should land with strong field coverage.",
        confidence: 0.9,
      };
    }

    if (coreFields >= 1 || amountFields >= 1) {
      return {
        label: "Mixed confidence",
        headline: `Some key columns mapped, some will fall back`,
        body: "The app can still import this, but a few fields are being inferred from generic bank-statement fallbacks.",
        confidence: 0.68,
      };
    }

    return {
      label: "Fallback only",
      headline: "AI mapping was weak on this file",
      body: "The import can still continue, but it is leaning on fallback header guesses rather than a confident mapping.",
      confidence: 0.45,
    };
  }

  function normalizeImportedRow(row, mapping) {
    const amount = resolveImportedAmount(row, mapping);
    const date = getFirstRowValue(
      row,
      mapping?.date,
      "Date",
      "date",
      "TransactionDate",
      "Transaction Date",
      "Posted Date"
    );
    const description = buildImportedDescription(row, mapping);

    if (!date || !description || Number.isNaN(amount)) {
      return null;
    }

    const category = detectCategory(description, amount);

    return {
      date,
      description: normalizeDescription(description),
      amount,
      direction: amount >= 0 ? "in" : "out",
      category,
      is_bill: category === "Bill",
      is_subscription: category === "Subscription",
      is_internal_transfer: category === "Internal Transfer",
      is_income: category === "Income",
    };
  }

  function buildFileCard(file, rows, mappingMeta = null) {
    const guessedName = guessAccountName(file.name);
    const matchingAccount = accounts.find(
      (account) =>
        normalizeText(account.name) === normalizeText(guessedName) ||
        normalizeText(account.nickname) === normalizeText(guessedName)
    );
    const dateSummary = summariseRowsForImport(rows);
    const fingerprint = getImportFingerprint(file.name, rows);
    const duplicateImport = statementImports.find(
      (item) => item.file_fingerprint && item.file_fingerprint === fingerprint
    );
    const overlapSummary = getImportOverlapSummary(rows, existingTransactions);

    return {
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
      fileName: file.name,
      rows,
      selectedAccountId: matchingAccount?.id || "",
      newAccountName: matchingAccount ? "" : guessedName,
      guessedAccountName: guessedName,
      importMeta: {
        ...dateSummary,
        fingerprint,
        duplicateImport,
        overlapSummary,
        mappingMeta,
      },
    };
  }

  function handleFiles(event) {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) return;

    selectedFiles.forEach((file) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        beforeFirstChunk(chunk) {
          const headerIndex = detectHeaderRowIndex(chunk);
          if (headerIndex <= 0) return chunk;

          const lines = chunk.split(/\r?\n/);
          return lines.slice(headerIndex).join("\n");
        },
        complete: async function (results) {
          const headers = Object.keys(results.data[0] || {});
          const sampleRows = results.data.slice(0, 5);
          const mapping = await requestCsvMapping(headers, sampleRows);
          const mappingMeta = summarizeMappingQuality(headers, mapping);

          const cleaned = results.data
            .map((row) => normalizeImportedRow(row, mapping))
            .filter(Boolean);

          setFiles((prev) => {
            const nextCard = buildFileCard(file, cleaned, mappingMeta);
            const withoutDuplicate = prev.filter((item) => item.id !== nextCard.id);
            return [...withoutDuplicate, nextCard].sort((a, b) => a.fileName.localeCompare(b.fileName));
          });
        },
        error(parseError) {
          console.error("CSV parse failed:", parseError);
          alert(`Could not read ${file.name}. Please check the file format and try again.`);
        },
      });
    });

    event.target.value = "";
  }

  function updateFile(id, patch) {
    setFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function removeFile(id) {
    setFiles((prev) => prev.filter((item) => item.id !== id));
  }

  async function ensureAccount(userId, fileItem) {
    if (fileItem.selectedAccountId) return fileItem.selectedAccountId;

    const accountName =
      fileItem.newAccountName.trim() ||
      fileItem.guessedAccountName ||
      "Imported Account";

    const { data, error } = await supabase
      .from("accounts")
      .upsert(
        {
          user_id: userId,
          name: accountName,
          nickname: accountName,
          institution: guessInstitution(accountName),
          detection_keywords: [accountName.toLowerCase()],
        },
        { onConflict: "user_id,name" }
      )
      .select()
      .single();

    if (error) throw error;
    return data.id;
  }

  async function saveAllImports() {
    if (files.length === 0) return;

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let totalSavedFiles = 0;
      let totalRows = 0;
      let skippedFiles = 0;

      for (const fileItem of files) {
        if (!fileItem.rows.length) continue;
        if (fileItem.importMeta?.duplicateImport) {
          skippedFiles += 1;
          continue;
        }

        const accountId = await ensureAccount(user.id, fileItem);

        const { data: importRow, error: importError } = await supabase
          .from("statement_imports")
          .insert({
            user_id: user.id,
            account_id: accountId,
            file_name: fileItem.fileName,
            detected_account_name:
              fileItem.newAccountName ||
              accounts.find((a) => a.id === accountId)?.name ||
              fileItem.guessedAccountName ||
              "Imported Account",
            row_count: fileItem.rows.length,
            import_summary: `Imported ${fileItem.rows.length} rows from ${fileItem.fileName}`,
            start_date: fileItem.importMeta?.startDate || null,
            end_date: fileItem.importMeta?.endDate || null,
            detected_month_count: fileItem.importMeta?.monthCount || null,
            file_fingerprint: fileItem.importMeta?.fingerprint || null,
          })
          .select()
          .single();

        if (importError) {
          const isDuplicateImport =
            importError.code === "23505" ||
            String(importError.message || "").includes("statement_imports_user_fingerprint_idx");

          if (isDuplicateImport) {
            skippedFiles += 1;
            continue;
          }

          throw importError;
        }

        const transactionsToSave = fileItem.rows.map((row) => ({
          user_id: user.id,
          account_id: accountId,
          import_id: importRow.id,
          transaction_date: row.date,
          description: row.description,
          merchant: row.description,
          amount: row.amount,
          direction: row.direction,
          category: row.category,
          is_internal_transfer: row.is_internal_transfer,
          is_income: row.is_income,
          is_bill: row.is_bill,
          is_subscription: row.is_subscription,
          ai_confidence: getTransactionConfidence(row),
          duplicate_key: makeDuplicateKey(row, accountId),
        }));

        const { error } = await supabase
          .from("transactions")
          .upsert(transactionsToSave, {
            onConflict: "user_id,duplicate_key",
            ignoreDuplicates: true,
          });

        if (error) throw error;

        await supabase
          .from("accounts")
          .update({ last_imported_at: new Date().toISOString() })
          .eq("id", accountId);

        totalSavedFiles += 1;
        totalRows += fileItem.rows.length;
      }

      alert(
        `Imported ${totalSavedFiles} file${totalSavedFiles === 1 ? "" : "s"}, scanned ${totalRows} rows, and skipped ${skippedFiles} file${skippedFiles === 1 ? "" : "s"} that already looked imported.`
      );
      setFiles([]);
      onImportDone();
    } catch (error) {
      alert(error.message || "Import failed.");
    } finally {
      setSaving(false);
    }
  }

  const allPreviewRows = files.flatMap((item) => item.rows);
  const previewTransactions = enhanceTransactions(
    allPreviewRows.map((row, index) => ({
      id: index,
      amount: row.amount,
      category: row.category,
      transaction_date: row.date,
      description: row.description,
      is_bill: row.is_bill,
      is_subscription: row.is_subscription,
      is_internal_transfer: row.is_internal_transfer,
      is_income: row.is_income,
    })),
    []
  );
  const previewTotals = getTotals(previewTransactions);
  const previewHistory = getHistorySummary(previewTransactions);
  const previewRecurring = getRecurringSummary(previewTransactions);
  const previewTransfers = getTransferSummary(previewTransactions);

  return (
    <>
      <Section
        styles={styles}
        title="Bulk Statement Upload"
        right={
          <button
            style={styles.ghostBtn}
            type="button"
            onClick={() => onGoToCoach(uploadGuidance.aiPrompt, { autoSend: true })}
          >
            Ask AI what to upload
          </button>
        }
      >
        <p style={styles.sectionIntro}>
          Add multiple CSV statements at once. The app will now read date ranges,
          spot likely duplicate imports before saving, ignore more fake transfer income,
          and get much sharper once you have around three months of history.
        </p>

        <div
  style={{
    position: "relative",
    padding: showUploadHint ? 14 : 0,
    borderRadius: 18,
    boxShadow: showUploadHint
      ? "0 0 0 4px rgba(34, 211, 238, 0.22), 0 18px 50px rgba(15, 23, 42, 0.18)"
      : "none",
    transition: "all 220ms ease",
  }}
>
  {showUploadHint && (
    <div
      style={{
        marginBottom: 10,
        fontWeight: 800,
        color: "#0891b2",
      }}
    >
      Start here: choose your CSV statement
    </div>
  )}

  <input
    id="statement-upload-input"
    type="file"
    accept=".csv"
    multiple
    onChange={handleFiles}
    style={styles.input}
  />
</div>
      </Section>

      <Section styles={styles} title="Upload Plan">
        <div style={styles.aiInsightGrid}>
          <InsightCard styles={styles}
            label={uploadGuidance.status}
            headline={uploadGuidance.headline}
            body={uploadGuidance.body}
            ctaLabel="Ask AI"
            onClick={() => onGoToCoach(uploadGuidance.aiPrompt, { autoSend: true })}
          />
          <ActionCard styles={styles}
            label="Next best upload"
            headline={uploadGuidance.nextBestUpload}
            body="This keeps setup focused so the app gets smarter without making you do needless admin."
            actionLabel="Choose CSV files"
            onClick={() => document.getElementById("statement-upload-input")?.click()}
          />
        </div>
        <div style={styles.inlineInfoBlock}>
          {uploadGuidance.checklist.map((item) => (
            <Row styles={styles} key={item} name="Check" value={item} />
          ))}
        </div>
      </Section>

      {files.length > 0 && (
        <>
          <div style={getGridStyle(screenWidth)}>
            <MiniCard styles={styles} title="Files" value={`${files.length}`} />
            <MiniCard styles={styles} title="Rows" value={`${allPreviewRows.length}`} />
            <MiniCard styles={styles} title="History read" value={previewHistory.label} />
            <MiniCard styles={styles} title="Recurring read" value={previewRecurring.label} />
          </div>

          <Section styles={styles} title="Smart Import Read">
            <div style={styles.aiInsightGrid}>
              <InsightCard styles={styles}
                label="Income preview"
                headline={`£${previewTotals.income.toFixed(2)} income seen`}
                body="Internal transfers are treated separately so fake income is less likely to pollute the totals."
              />
              <InsightCard styles={styles}
                label="History confidence"
                headline={previewHistory.headline}
                body={previewHistory.body}
              />
              <InsightCard styles={styles}
                label="Recurring confidence"
                headline={previewRecurring.headline}
                body={previewRecurring.body}
              />
              <InsightCard styles={styles}
                label="Transfer read"
                headline={previewTransfers.headline}
                body={previewTransfers.body}
              />
              <InsightCard styles={styles}
                label="Mapping quality"
                headline={files[0]?.importMeta?.mappingMeta?.headline || "Fallbacks are ready"}
                body={files[0]?.importMeta?.mappingMeta?.body || "If AI misses anything, the import still falls back to common bank column names."}
              />
            </div>
          </Section>

          <Section styles={styles} title="Files To Import">
            {files.map((item) => (
              <div key={item.id} style={styles.signalCard}>
                <div style={styles.signalHeader}>
                  <div>
                    <strong>{item.fileName}</strong>
                    <p style={styles.transactionMeta}>
                      {item.rows.length} rows · {formatDateRange(item.importMeta?.startDate, item.importMeta?.endDate)} · {item.importMeta?.fullMonthCount || item.importMeta?.monthCount || 0} full-ish month{(item.importMeta?.fullMonthCount || item.importMeta?.monthCount || 0) === 1 ? "" : "s"} read
                    </p>
                  </div>

                  <button
                    style={styles.secondaryInlineBtn}
                    onClick={() => removeFile(item.id)}
                  >
                    Remove
                  </button>
                </div>

                <select
                  style={styles.input}
                  value={item.selectedAccountId}
                  onChange={(e) =>
                    updateFile(item.id, { selectedAccountId: e.target.value })
                  }
                >
                  <option value="">Create or guess account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>

                {!item.selectedAccountId && (
                  <input
                    style={styles.input}
                    placeholder="Account name, e.g. Monzo Current"
                    value={item.newAccountName}
                    onChange={(e) =>
                      updateFile(item.id, { newAccountName: e.target.value })
                    }
                  />
                )}

                <div style={styles.statusPillRow}>
                  {item.importMeta?.duplicateImport ? (
                    <span style={getStatusPillStyle("bad")}>Already imported before</span>
                  ) : null}
                  {item.importMeta?.overlapSummary?.ratio >= 0.35 ? (
                    <span style={getStatusPillStyle("warn")}>Heavy overlap with existing data</span>
                  ) : null}
                  {(item.importMeta?.fullMonthCount || item.importMeta?.monthCount || 0) >= 3 ? (
                    <span style={getStatusPillStyle("good")}>Good history signal</span>
                  ) : (
                    <span style={getStatusPillStyle("neutral")}>Early read</span>
                  )}
                </div>

                <p style={styles.smallMuted}>
                  First few transactions: {item.rows.slice(0, 3).map((row) => row.description).join(" · ")}
                </p>
              </div>
            ))}
          </Section>

          <button
            style={styles.primaryBtn}
            onClick={saveAllImports}
            disabled={saving}
          >
            {saving ? "Importing..." : "Import All Statements"}
          </button>
        </>
      )}
    </>
  );
}



