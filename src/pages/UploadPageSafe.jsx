import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { supabase } from "../supabase";
import { ActionCard, InsightCard, MiniCard, Row, Section } from "../components/ui";
import {
  formatDateRange,
  getImportFingerprint,
  getLegacyImportFingerprint,
  getImportOverlapSummary,
  getTransactionConfidence,
  summariseRowsForImport,
} from "../lib/importAnalysis";
import { buildUploadGuidance } from "../lib/uploadGuidance";
import { formatCurrency, getTotals, normalizeText } from "../lib/finance";
import { validateStatementCsvFileContent } from "../lib/security";
import {
  enhanceTransactions,
  getHistorySummary,
  getRecurringSummary,
  getTransferSummary,
} from "../lib/dashboardIntelligence";
import { getGridStyle } from "../lib/styleHelpers";
import { getFunctionErrorMessage } from "../lib/functionErrors";
import { inferTransactionCategory } from "../lib/transactionCategorisation";

const MAX_DATE_ERRORS_TO_SHOW = 5;
const ALREADY_IMPORTED_RATIO = 0.85;

export default function UploadPageSafe({
  accounts,
  statementImports,
  existingTransactions,
  transactionRules = [],
  onImportDone,
  onGoToCoach,
  screenWidth,
  styles,
}) {
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showUploadHint, setShowUploadHint] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({
    phase: "idle",
    step: 0,
    tone: "neutral",
    title: "Ready to read your statements",
    body: "Choose your CSV files. Money Hub will preview them before saving anything.",
  });

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
    const normalizedEntries = rowEntries.map(([key, value]) => [normalizeHeaderKey(key), value]);

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
        setUploadStatus({
          phase: "mapping-fallback",
          step: 1,
          tone: "warning",
          title: "Using the built-in CSV reader",
          body: await getFunctionErrorMessage(error, "AI column matching is busy, so Money Hub is using the built-in CSV reader instead."),
        });
        return null;
      }

      return data || null;
    } catch (error) {
      setUploadStatus({
        phase: "mapping-fallback",
        step: 1,
        tone: "warning",
        title: "Using the built-in CSV reader",
        body: error?.message || "AI column matching is busy, so Money Hub is using the built-in CSV reader instead.",
      });
      return null;
    }
  }

  function normaliseStatementDate(value) {
    const raw = String(value ?? "").trim();
    if (!raw) {
      return { ok: false, reason: "missing date" };
    }

    const cleaned = raw
      .replace(/\u00a0/g, " ")
      .replace(/,/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const isoMatch = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (isoMatch) {
      return buildIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]), raw);
    }

    const monthNameMatch = cleaned.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]{3,9})\s+(\d{2}|\d{4})$/);
    if (monthNameMatch) {
      const month = monthNameToNumber(monthNameMatch[2]);
      const year = normaliseYear(monthNameMatch[3]);
      return buildIsoDate(year, month, Number(monthNameMatch[1]), raw);
    }

    const monthNameLeadingMatch = cleaned.match(/^([a-zA-Z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{2}|\d{4})$/);
    if (monthNameLeadingMatch) {
      const month = monthNameToNumber(monthNameLeadingMatch[1]);
      const year = normaliseYear(monthNameLeadingMatch[3]);
      return buildIsoDate(year, month, Number(monthNameLeadingMatch[2]), raw);
    }

    const ukNumericMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
    if (ukNumericMatch) {
      const day = Number(ukNumericMatch[1]);
      const month = Number(ukNumericMatch[2]);
      const year = normaliseYear(ukNumericMatch[3]);

      if (day <= 12 && month <= 12) {
        return {
          ok: false,
          reason: `ambiguous numeric date "${raw}". Use ISO YYYY-MM-DD or an unambiguous UK date like 13/02/2026`,
        };
      }

      return buildIsoDate(year, month, day, raw);
    }

    return {
      ok: false,
      reason: `unsupported date "${raw}". Use ISO YYYY-MM-DD, DD/MM/YYYY, or DD Mon YYYY`,
    };
  }

  function normaliseYear(value) {
    const year = Number(value);
    if (String(value).length === 2) return year >= 70 ? 1900 + year : 2000 + year;
    return year;
  }

  function monthNameToNumber(value) {
    const key = String(value || "").toLowerCase().slice(0, 3);
    return {
      jan: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      may: 5,
      jun: 6,
      jul: 7,
      aug: 8,
      sep: 9,
      oct: 10,
      nov: 11,
      dec: 12,
    }[key] || Number.NaN;
  }

  function buildIsoDate(year, month, day, raw) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return { ok: false, reason: `invalid date "${raw}"` };
    }

    if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
      return { ok: false, reason: `invalid date "${raw}"` };
    }

    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return { ok: false, reason: `invalid date "${raw}"` };
    }

    return { ok: true, iso: date.toISOString().slice(0, 10) };
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

    if (!Number.isNaN(parsedMoneyIn) && parsedMoneyIn > 0) return parsedMoneyIn;
    if (!Number.isNaN(parsedMoneyOut) && parsedMoneyOut > 0) return -parsedMoneyOut;
    if (!Number.isNaN(parsedMoneyIn)) return parsedMoneyIn;
    if (!Number.isNaN(parsedMoneyOut)) return -parsedMoneyOut;

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

    if (signedAmount !== "") return cleanAmount(signedAmount);
    return Number.NaN;
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

  function normaliseImportedRow(row, mapping) {
    const amount = resolveImportedAmount(row, mapping);
    const rawDate = getFirstRowValue(
      row,
      mapping?.date,
      "Date",
      "date",
      "TransactionDate",
      "Transaction Date",
      "Posted Date",
      "Booking Date"
    );
    const description = buildImportedDescription(row, mapping);
    const normalisedDate = normaliseStatementDate(rawDate);

    if (!description || Number.isNaN(amount)) {
      return { row: null, error: "missing description or amount" };
    }

    if (!normalisedDate.ok) {
      return { row: null, error: normalisedDate.reason };
    }

    const categoryInfo = inferTransactionCategory(description, amount);

    return {
      row: {
        date: normalisedDate.iso,
        raw_date: rawDate,
        description: normalizeDescription(description),
        amount,
        direction: amount >= 0 ? "in" : "out",
        category: categoryInfo.category,
        is_bill: categoryInfo.is_bill,
        is_subscription: categoryInfo.is_subscription,
        is_internal_transfer: categoryInfo.is_internal_transfer,
        is_income: categoryInfo.is_income,
      },
      error: "",
    };
  }

  function normaliseDuplicateText(value) {
    return normalizeDescription(value)
      .toLowerCase()
      .replace(/\b(pending|card payment|card purchase|debit card|contactless|faster payment|online banking|pos|purchase)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((token) => token.length >= 3)
      .slice(0, 12)
      .join(" ")
      .trim();
  }

  function amountToPence(amount) {
    return Math.round(Number(amount || 0) * 100);
  }

  function makeDuplicateKey(row, accountId) {
    const date = row.date;
    const pence = amountToPence(row.amount);
    const description = normaliseDuplicateText(row.description) || "no-description";
    return `${accountId}|${date}|${pence}|${description}`;
  }

  function makeNearDuplicateKey(row) {
    return `${row.date}|${amountToPence(row.amount)}|${normaliseDuplicateText(row.description)}`;
  }

  function getNearDuplicateSummary(rows, existingRows) {
    const existingKeys = new Set(
      (existingRows || [])
        .map((transaction) => makeNearDuplicateKey({
          date: transaction.transaction_date,
          amount: transaction.amount,
          description: transaction.description || transaction.merchant || "",
        }))
        .filter(Boolean)
    );

    const matches = rows.filter((row) => existingKeys.has(makeNearDuplicateKey(row)));
    return {
      count: matches.length,
      sample: matches.slice(0, 3).map((row) => `${row.date} ${row.description} £${Math.abs(Number(row.amount || 0)).toFixed(2)}`),
    };
  }

  function summarizeMappingQuality(headers, mapping, dateErrorCount = 0) {
    if (!headers.length) {
      return {
        label: "Fallback only",
        headline: "No header shape detected yet",
        body: "The import will rely on generic fallbacks until a usable header row is found.",
        confidence: 0.4,
      };
    }

    if (dateErrorCount > 0) {
      return {
        label: "Needs date fix",
        headline: `${dateErrorCount} row${dateErrorCount === 1 ? "" : "s"} had unsafe dates`,
        body: "Ambiguous or unsupported dates were rejected so Money Hub does not save the wrong month.",
        confidence: 0.3,
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
        body: "Dates, names and amounts look readable. Money Hub can safely check this against what is already saved.",
        confidence: 0.9,
      };
    }

    if (coreFields >= 1 || amountFields >= 1) {
      return {
        label: "Mixed confidence",
        headline: "Some key columns mapped, some will fall back",
        body: "The app can still read this, but check the preview before saving.",
        confidence: 0.68,
      };
    }

    return {
      label: "Fallback only",
      headline: "Using the backup reader",
      body: "Money Hub is using its backup reader. Check the preview before saving.",
      confidence: 0.45,
    };
  }

  function buildFileCard(file, rows, mappingMeta = null, dateErrors = []) {
    const guessedName = guessAccountName(file.name);
    const matchingAccount = accounts.find(
      (account) =>
        normalizeText(account.name) === normalizeText(guessedName) ||
        normalizeText(account.nickname) === normalizeText(guessedName)
    );
    const dateSummary = summariseRowsForImport(rows);
    const fingerprint = getImportFingerprint(rows);
    const legacyFingerprint = getLegacyImportFingerprint(file.name, rows);
    const duplicateImport = statementImports.find(
      (item) => item.file_fingerprint && (item.file_fingerprint === fingerprint || item.file_fingerprint === legacyFingerprint)
    );
    const overlapSummary = getImportOverlapSummary(rows, existingTransactions);
    const nearDuplicateSummary = getNearDuplicateSummary(rows, existingTransactions);
    const alreadyImported =
      Boolean(duplicateImport) ||
      overlapSummary.ratio >= ALREADY_IMPORTED_RATIO ||
      (rows.length > 0 && nearDuplicateSummary.count / rows.length >= ALREADY_IMPORTED_RATIO);

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
        legacyFingerprint,
        duplicateImport,
        alreadyImported,
        overlapSummary,
        nearDuplicateSummary,
        mappingMeta,
        dateErrors,
      },
    };
  }

  async function handleFiles(event) {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) return;

    setUploadStatus({
      phase: "reading",
      step: 1,
      tone: "working",
      title: selectedFiles.length === 1 ? "Reading your statement" : `Reading ${selectedFiles.length} statements`,
      body: "Money Hub is checking your file. Nothing has been saved yet.",
    });

    try {
      for (const file of selectedFiles) {
        let validation;

        try {
          validation = await validateStatementCsvFileContent(file);
        } catch (error) {
          const message = error?.message || "That file does not look like a bank statement CSV. Export a CSV from your bank and try that file.";
          setUploadStatus({
            phase: "error",
            step: 1,
            tone: "bad",
            title: "That file does not look right",
            body: message,
          });
          continue;
        }

        if (!validation.ok) {
          setUploadStatus({
            phase: "error",
            step: 1,
            tone: "bad",
            title: "That file does not look like a CSV",
            body: "Choose the CSV export from your bank. A screenshot, PDF, spreadsheet, or renamed file will not work here.",
          });
          continue;
        }

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
            try {
              const headers = Object.keys(results.data[0] || {});
              const sampleRows = results.data.slice(0, 5);

              setUploadStatus({
                phase: "mapping",
                step: 2,
                tone: "working",
                title: `Understanding ${file.name}`,
                body: "AI is matching the bank columns to date, description and money in/out.",
              });

              const mapping = await requestCsvMapping(headers, sampleRows);
              const normalised = results.data.map((row) => normaliseImportedRow(row, mapping));
              const cleaned = normalised.map((item) => item.row).filter(Boolean);
              const dateErrors = normalised
                .map((item, index) => ({ index: index + 1, error: item.error }))
                .filter((item) => item.error && /date/i.test(item.error));
              const mappingMeta = summarizeMappingQuality(headers, mapping, dateErrors.length);

              if (dateErrors.length > 0) {
                const examples = dateErrors
                  .slice(0, MAX_DATE_ERRORS_TO_SHOW)
                  .map((item) => `Row ${item.index}: ${item.error}`)
                  .join("\n");
                setUploadStatus({
                  phase: "date-error",
                  step: 2,
                  tone: "bad",
                  title: "Fix the statement dates first",
                  body: `${dateErrors.length} row${dateErrors.length === 1 ? "" : "s"} had dates Money Hub cannot safely understand. Nothing from this file was added.`,
                });
                console.warn(`Money Hub rejected unsafe dates in ${file.name}.\n${examples}`);
                return;
              }

              if (cleaned.length === 0) {
                setUploadStatus({
                  phase: "error",
                  step: 2,
                  tone: "bad",
                  title: "Could not find usable rows",
                  body: "Money Hub could not find the date, description and amount columns. Try a fresh CSV export from your bank.",
                });
                return;
              }

              setFiles((prev) => {
                const nextCard = buildFileCard(file, cleaned, mappingMeta, dateErrors);
                const withoutDuplicate = prev.filter((item) => item.id !== nextCard.id);
                return [...withoutDuplicate, nextCard].sort((a, b) => a.fileName.localeCompare(b.fileName));
              });

              setUploadStatus({
                phase: "ready",
                step: 3,
                tone: "good",
                title: "Statement ready to import",
                body: "Money Hub can read this file. Check the preview, then save it.",
              });
            } catch (error) {
              setUploadStatus({
                phase: "error",
                step: 2,
                tone: "bad",
                title: "Could not read that statement",
                body: error?.message || "Money Hub could not read that file. Try a fresh CSV export from your bank.",
              });
            }
          },
          error() {
            setUploadStatus({
              phase: "error",
              step: 1,
              tone: "bad",
              title: "Could not read that statement",
              body: "Money Hub could not read that file. Try a fresh CSV export from your bank.",
            });
          },
        });
      }
    } finally {
      event.target.value = "";
    }
  }

  function updateFile(id, patch) {
    setFiles((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeFile(id) {
    setFiles((prev) => prev.filter((item) => item.id !== id));
  }

  async function ensureAccount(userId, fileItem) {
    if (fileItem.selectedAccountId) return fileItem.selectedAccountId;

    const accountName = fileItem.newAccountName.trim() || fileItem.guessedAccountName || "Imported Account";

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
    setUploadStatus({
      phase: "saving",
      step: 4,
      tone: "working",
      title: "Importing your statements",
      body: "Saving normalised transactions safely. Keep this page open.",
    });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let totalSavedFiles = 0;
      let totalRows = 0;
      let skippedFiles = 0;

      for (const fileItem of files) {
        if (!fileItem.rows.length) continue;
        if (fileItem.importMeta?.duplicateImport || fileItem.importMeta?.alreadyImported) {
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
              accounts.find((account) => account.id === accountId)?.name ||
              fileItem.guessedAccountName ||
              "Imported Account",
            row_count: fileItem.rows.length,
            import_summary: `Imported ${fileItem.rows.length} ISO-normalised rows from ${fileItem.fileName}`,
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

        const enhancedRows = enhanceTransactions(
          fileItem.rows.map((row, index) => ({
            id: `${fileItem.id}-${index}`,
            amount: row.amount,
            category: row.category,
            transaction_date: row.date,
            description: row.description,
            is_bill: row.is_bill,
            is_subscription: row.is_subscription,
            is_internal_transfer: row.is_internal_transfer,
            is_income: row.is_income,
          })),
          transactionRules
        );

        const transactionsToSave = fileItem.rows.map((row, index) => {
          const smartRow = enhancedRows[index] || row;
          return {
            user_id: user.id,
            account_id: accountId,
            import_id: importRow.id,
            transaction_date: row.date,
            description: row.description,
            merchant: row.description,
            amount: row.amount,
            direction: row.direction,
            category: smartRow._smart_category || row.category,
            is_internal_transfer: Boolean(smartRow._smart_internal_transfer || row.is_internal_transfer),
            is_income: row.is_income,
            is_bill: Boolean(smartRow._smart_is_bill || row.is_bill),
            is_subscription: Boolean(smartRow._smart_is_subscription || row.is_subscription),
            ai_confidence: getTransactionConfidence(row),
            duplicate_key: makeDuplicateKey(row, accountId),
          };
        });

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
          .eq("id", accountId)
          .eq("user_id", user.id);

        totalSavedFiles += 1;
        totalRows += fileItem.rows.length;
      }

      if (totalSavedFiles > 0) {
        setUploadStatus({
          phase: "organising",
          step: 5,
          tone: "working",
          title: "Organising your money",
          body: "Finding your bills, rent, subscriptions and spending patterns for Home and Calendar.",
        });

        await onImportDone?.();
      }

      setFiles([]);

      setUploadStatus({
        phase: "done",
        step: 5,
        tone: "good",
        title: totalSavedFiles > 0 ? "Statements saved" : "Nothing new to save",
        body: totalSavedFiles > 0
          ? `Saved ${totalSavedFiles} new file${totalSavedFiles === 1 ? "" : "s"} with ${totalRows} row${totalRows === 1 ? "" : "s"}. Skipped ${skippedFiles} file${skippedFiles === 1 ? "" : "s"} that looked already uploaded.`
          : `Skipped ${skippedFiles} file${skippedFiles === 1 ? "" : "s"} because Money Hub already has them.`,
      });
    } catch (error) {
      setUploadStatus({
        phase: "error",
        step: 4,
        tone: "bad",
        title: "We could not save that statement",
        body: error.message || "Nothing was changed. Try again, or export a fresh CSV from your bank.",
      });
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
    transactionRules
  );
  const previewTotals = getTotals(previewTransactions);
  const previewHistory = getHistorySummary(previewTransactions);
  const previewRecurring = getRecurringSummary(previewTransactions);
  const previewTransfers = getTransferSummary(previewTransactions);
  const alreadyUploadedFiles = files.filter((file) => file.importMeta?.alreadyImported);
  const newFiles = files.filter((file) => !file.importMeta?.alreadyImported);
  const newRowsCount = newFiles.reduce((sum, file) => sum + file.rows.length, 0);

  return (
    <>
      <Section
        styles={styles}
        title="Upload Bank Statements"
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
          Choose your bank CSVs. Money Hub reads them, spots anything you already uploaded, and only saves the new stuff.
        </p>

        <UploadProgressCard status={uploadStatus} styles={styles} />

        <div
          style={{
            position: "relative",
            padding: showUploadHint ? 14 : 0,
            borderRadius: 22,
            boxShadow: showUploadHint
              ? "0 0 0 4px rgba(34, 211, 238, 0.22), 0 18px 50px rgba(15, 23, 42, 0.18)"
              : "none",
            transition: "all 220ms ease",
          }}
        >
          {showUploadHint && (
            <div style={{ marginBottom: 10, fontWeight: 800, color: "#0891b2" }}>
              Start here: choose your CSV statement
            </div>
          )}

          <input
            id="statement-upload-input"
            type="file"
            accept=".csv"
            multiple
            onChange={handleFiles}
            disabled={saving || uploadStatus.tone === "working"}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          />

          <label
            htmlFor="statement-upload-input"
            style={{
              minHeight: 118,
              borderRadius: 22,
              border: "1px dashed rgba(37, 99, 235, 0.35)",
              background: saving || uploadStatus.tone === "working" ? "#f8fafc" : "#eff6ff",
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              textAlign: "center",
              cursor: saving || uploadStatus.tone === "working" ? "not-allowed" : "pointer",
              color: saving || uploadStatus.tone === "working" ? "#64748b" : "#1d4ed8",
              padding: 18,
            }}
          >
            <strong>{saving || uploadStatus.tone === "working" ? "Working on your statement..." : "Choose CSV statements"}</strong>
            <span style={{ fontSize: 13 }}>
              {saving || uploadStatus.tone === "working"
                ? "Keep this page open for a moment."
                : "You can pick more than one. CSV only. Duplicates are fine."}
            </span>
          </label>
        </div>
      </Section>

      {files.length > 0 && (
        <div
          style={{
            position: "sticky",
            top: screenWidth <= 700 ? 8 : 14,
            zIndex: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: 14,
            marginBottom: 14,
            borderRadius: 20,
            background: "rgba(15, 23, 42, 0.94)",
            color: "white",
            boxShadow: "0 18px 45px rgba(15, 23, 42, 0.28)",
          }}
        >
          <div>
            <strong>{files.length} statement{files.length === 1 ? "" : "s"} ready</strong>
            <p style={{ ...styles.transactionMeta, margin: 0, color: "rgba(255,255,255,0.78)" }}>
              {newFiles.length ? `${newRowsCount} new row${newRowsCount === 1 ? "" : "s"} look ready.` : "Everything here looks already uploaded."} Nothing has been saved yet.
            </p>
          </div>

          <button
            style={{ ...styles.primaryInlineBtn, minWidth: 132, background: "white", color: "#0f172a" }}
            onClick={saveAllImports}
            disabled={saving}
          >
            {saving ? "Importing..." : newFiles.length ? "Save new stuff" : "Skip these"}
          </button>
        </div>
      )}

      <Section styles={styles} title="What To Upload">
        <div style={styles.aiInsightGrid}>
          <InsightCard
            styles={styles}
            label={uploadGuidance.status}
            headline={uploadGuidance.headline}
            body={uploadGuidance.body}
            ctaLabel="Ask AI"
            onClick={() => onGoToCoach(uploadGuidance.aiPrompt, { autoSend: true })}
          />
          <ActionCard
            styles={styles}
            label="Next best upload"
            headline={uploadGuidance.nextBestUpload}
            body="Start with the statements that cover your normal spending. Money Hub will do the sorting."
            actionLabel="Choose CSV files"
            onClick={() => document.getElementById("statement-upload-input")?.click()}
          />
        </div>
        <div style={styles.inlineInfoBlock}>
          {uploadGuidance.checklist.map((item) => (
            <Row styles={styles} key={item} name="Step" value={item} />
          ))}
        </div>
      </Section>

      {files.length > 0 && (
        <>
          <div style={getGridStyle(screenWidth)}>
            <MiniCard styles={styles} title="Files" value={`${files.length}`} />
            <MiniCard styles={styles} title="New files" value={`${newFiles.length}`} />
            <MiniCard styles={styles} title="Already uploaded" value={`${alreadyUploadedFiles.length}`} />
            <MiniCard styles={styles} title="Rows checked" value={`${allPreviewRows.length}`} />
          </div>

          {alreadyUploadedFiles.length > 0 ? (
            <Section styles={styles} title="Already Got These">
              <p style={styles.sectionIntro}>
                Money Hub found statement{alreadyUploadedFiles.length === 1 ? "" : "s"} that look like they are already in the app. They will be skipped so your spending does not double up.
              </p>
              {alreadyUploadedFiles.map((fileItem) => {
                const matchCount =
                  fileItem.importMeta?.nearDuplicateSummary?.count ||
                  fileItem.importMeta?.overlapSummary?.count ||
                  fileItem.rows.length;
                return (
                  <Row
                    key={`already-${fileItem.id}`}
                    styles={styles}
                    name={fileItem.fileName}
                    value={`${matchCount} matching row${matchCount === 1 ? "" : "s"}`}
                  />
                );
              })}
            </Section>
          ) : null}

          <Section styles={styles} title="What Money Hub Found">
            <div style={styles.aiInsightGrid}>
              <InsightCard
                styles={styles}
                label="Money in"
                headline={`${formatCurrency(previewTotals.income)} spotted`}
                body="This is a quick preview. Money Hub will sort wages, transfers and refunds properly after saving."
              />
              <InsightCard styles={styles} label="Dates" headline={previewHistory.headline} body={previewHistory.body} />
              <InsightCard styles={styles} label="Bills" headline={previewRecurring.headline} body={previewRecurring.body} />
              <InsightCard styles={styles} label="Transfers" headline={previewTransfers.headline} body={previewTransfers.body} />
            </div>
          </Section>

          <Section styles={styles} title="Check Before Saving">
            {files.map((fileItem) => (
              <div
                key={fileItem.id}
                style={{
                  ...styles.signalCard,
                  background: fileItem.importMeta?.alreadyImported ? "#fffbeb" : styles.signalCard?.background,
                  borderColor: fileItem.importMeta?.alreadyImported ? "rgba(245, 158, 11, 0.45)" : styles.signalCard?.borderColor,
                }}
              >
                <div style={styles.signalHeader}>
                  <div>
                    <strong>{fileItem.fileName}</strong>
                    <p style={styles.transactionMeta}>
                      {fileItem.rows.length} rows - {formatDateRange(fileItem.importMeta?.startDate, fileItem.importMeta?.endDate)}
                    </p>
                  </div>
                  <button style={styles.ghostBtn} type="button" onClick={() => removeFile(fileItem.id)} disabled={saving}>
                    Remove
                  </button>
                </div>

                {fileItem.importMeta?.alreadyImported ? (
                  <div style={styles.inlineInfoBlock}>
                    <strong>Looks already uploaded</strong>
                    <p style={styles.transactionMeta}>
                      Money Hub will skip this file when you save. That protects you from doubled spending and doubled income.
                    </p>
                  </div>
                ) : null}

                {fileItem.importMeta?.mappingMeta ? (
                  <p style={styles.signalBody}>
                    {fileItem.importMeta.mappingMeta.headline}. {fileItem.importMeta.mappingMeta.body}
                  </p>
                ) : null}

                {fileItem.importMeta?.nearDuplicateSummary?.count > 0 ? (
                  <div style={styles.inlineInfoBlock}>
                    <strong>Some rows may already be here</strong>
                    <p style={styles.transactionMeta}>
                      {fileItem.importMeta.nearDuplicateSummary.count} row{fileItem.importMeta.nearDuplicateSummary.count === 1 ? "" : "s"} match by date, amount and description. Money Hub uses this to avoid doubling things.
                    </p>
                    {fileItem.importMeta.nearDuplicateSummary.sample.map((item) => (
                      <Row key={item} name="Example" value={item} styles={styles} />
                    ))}
                  </div>
                ) : null}

                <label style={styles.label || { display: "block", marginTop: 12, fontWeight: 700 }}>
                  Existing account
                  <select
                    style={styles.input}
                    value={fileItem.selectedAccountId}
                    onChange={(event) => updateFile(fileItem.id, { selectedAccountId: event.target.value })}
                    disabled={saving}
                  >
                    <option value="">Create/use account below</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name || account.nickname || account.institution || "Account"}
                      </option>
                    ))}
                  </select>
                </label>

                {!fileItem.selectedAccountId ? (
                  <label style={styles.label || { display: "block", marginTop: 12, fontWeight: 700 }}>
                    New account name
                    <input
                      style={styles.input}
                      value={fileItem.newAccountName}
                      onChange={(event) => updateFile(fileItem.id, { newAccountName: event.target.value })}
                      placeholder="Imported Account"
                      disabled={saving}
                    />
                  </label>
                ) : null}
              </div>
            ))}
          </Section>
        </>
      )}
    </>
  );
}

function UploadProgressCard({ status, styles }) {
  return (
    <div style={styles.inlineInfoBlock}>
      <Row name={status.step ? `Step ${status.step}` : "Status"} value={status.title} styles={styles} />
      <p style={styles.transactionMeta}>{status.body}</p>
    </div>
  );
}
