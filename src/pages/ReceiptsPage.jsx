import { useState } from "react";
import { supabase } from "../supabase";
import {
  dayDifference,
  formatCurrency,
  isInternalTransferLike,
  parseAppDate,
  toIsoDate,
} from "../lib/finance";
import {
  buildPrivateStoragePath,
  getSignedStorageUrl,
  prepareSensitiveUploadFile,
  validateSensitiveFileContent,
} from "../lib/security";
import { Notice, Section } from "../components/ui";

export default function ReceiptsPage({ receipts, transactions, onChange, onGoToCoach, styles }) {
  const [merchant, setMerchant] = useState("");
  const [total, setTotal] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [file, setFile] = useState(null);
  const [keepFile, setKeepFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [match, setMatch] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [receiptFilter, setReceiptFilter] = useState("all");
  const [viewerReceipt, setViewerReceipt] = useState(null);
  const [viewerError, setViewerError] = useState("");
  const [notice, setNotice] = useState(null);

  function guessFromFileName(fileName) {
    const clean = fileName.toLowerCase();

    let guessedMerchant = "";
    if (clean.includes("tesco")) guessedMerchant = "Tesco";
    else if (clean.includes("amazon")) guessedMerchant = "Amazon";
    else if (clean.includes("costa")) guessedMerchant = "Costa";
    else if (clean.includes("shell")) guessedMerchant = "Shell";

    return { guessedMerchant };
  }

  function findMatchingTransaction(nextMerchant, nextTotal, nextDate) {
    if (!nextMerchant || !nextTotal) return null;
    return findReceiptCandidates(nextMerchant, nextTotal, nextDate)[0] || null;
  }

  function findReceiptCandidates(nextMerchant, nextTotal, nextDate) {
    if (!nextMerchant || !nextTotal) return [];

    const merchantText = nextMerchant.toLowerCase();
    const merchantTokens = merchantText
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 3);
    const receiptAmount = Number(nextTotal);
    const parsedReceiptDate = nextDate ? parseAppDate(nextDate) : null;

    return transactions
      .filter((transaction) => Number(transaction.amount) < 0 && !isInternalTransferLike(transaction))
      .map((transaction) => {
        const description = String(transaction.description || "").toLowerCase();
        const amount = Math.abs(Number(transaction.amount || 0));
        const parsedTransactionDate = parseAppDate(transaction.transaction_date);

        const merchantMatches =
          description.includes(merchantText) ||
          merchantTokens.some((token) => description.includes(token));
        const amountMatches = Math.abs(amount - receiptAmount) < 0.02;
        const dateDistance = parsedReceiptDate && parsedTransactionDate
          ? Math.abs(dayDifference(toIsoDate(parsedTransactionDate), toIsoDate(parsedReceiptDate)))
          : 99;
        const dateMatches = !parsedReceiptDate || dateDistance <= 7;
        const score =
          (amountMatches ? 6 : Math.abs(amount - receiptAmount) <= 1 ? 3 : 0) +
          (merchantMatches ? 4 : 0) +
          (parsedReceiptDate ? Math.max(0, 3 - Math.min(dateDistance, 3)) : 1);

        return { transaction, amountMatches, merchantMatches, dateMatches, score, dateDistance };
      })
      .filter((item) => item.score >= 6 && item.dateMatches)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((item) => item.transaction);
  }

  async function handleFileChange(event) {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    const validation = await validateSensitiveFileContent(selectedFile);
    if (!validation.ok) {
      setNotice({ tone: "bad", message: "That file does not look like a receipt. Upload a clear photo, image, or PDF." });
      event.target.value = "";
      return;
    }

    setFile(selectedFile);
    if (!keepFile) setKeepFile(true);

    const guess = guessFromFileName(selectedFile.name);
    if (guess.guessedMerchant && !merchant) {
      setMerchant(guess.guessedMerchant);
    } else if (!merchant) {
      setMerchant(selectedFile.name.replace(/\.[^.]+$/, ""));
    }
  }

  function updateMerchant(value) {
    setMerchant(value);
    setMatch(findMatchingTransaction(value, total, receiptDate));
  }

  function updateTotal(value) {
    setTotal(value);
    setMatch(findMatchingTransaction(merchant, value, receiptDate));
  }

  function updateDate(value) {
    setReceiptDate(value);
    setMatch(findMatchingTransaction(merchant, total, value));
  }

  async function addReceipt() {
    if (!merchant.trim() && !file) {
      setNotice({ tone: "warn", message: "Add a receipt name or upload a receipt first." });
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let filePath = null;
    let fileType = file?.type || null;

    if (file && keepFile) {
      const uploadValidation = await validateSensitiveFileContent(file);
      if (!uploadValidation.ok) {
        setSaving(false);
        setNotice({ tone: "bad", message: "That file does not look like a receipt. Upload a clear photo, image, or PDF." });
        return;
      }

      const uploadFile = await prepareSensitiveUploadFile(file, {
        maxDimension: 1600,
        quality: 0.7,
      });
      fileType = uploadFile.type || fileType;
      filePath = buildPrivateStoragePath(user.id, "receipts", uploadFile.name);

      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(filePath, uploadFile, {
          cacheControl: "private, max-age=0, no-store",
          upsert: false,
        });

      if (uploadError) {
        setSaving(false);
        setNotice({ tone: "bad", message: uploadError.message || "We could not upload that receipt. Nothing was saved." });
        return;
      }

    }

    const displayName = merchant.trim() || file?.name.replace(/\.[^.]+$/, "") || "Saved receipt";
    const receiptSummary = match
      ? `Matched to transaction: ${match.description}`
      : file
      ? keepFile
        ? "Receipt saved for warranty or returns."
        : "Receipt added without keeping the file."
      : "Manual receipt added.";

    const receiptPayload = {
      user_id: user.id,
      transaction_id: match?.id || null,
      merchant: displayName,
      total: Number(total || 0),
      receipt_date: receiptDate || null,
      source: file ? "upload" : "manual",
      matched_status: match ? "matched" : "unmatched",
      file_path: filePath,
      file_url: null,
      file_type: fileType,
      ai_summary: receiptSummary,
    };

    let { error } = await supabase.from("receipts").insert(receiptPayload);

    if (error && String(error.message || "").includes("schema cache")) {
      const fallbackPayload = {
        user_id: receiptPayload.user_id,
        transaction_id: receiptPayload.transaction_id,
        merchant: receiptPayload.merchant,
        total: receiptPayload.total,
        receipt_date: receiptPayload.receipt_date,
        source: receiptPayload.source,
        matched_status: receiptPayload.matched_status,
      };
      ({ error } = await supabase.from("receipts").insert(fallbackPayload));
    }

    setSaving(false);

    if (error) {
      setNotice({ tone: "bad", message: error.message || "We could not save that receipt. Nothing was changed." });
      return;
    }

    setMerchant("");
    setTotal("");
    setReceiptDate("");
    setFile(null);
    setKeepFile(false);
    setMatch(null);

    setNotice({
      tone: "good",
      message: match ? "Receipt saved and matched to a payment." : "Receipt saved.",
    });
    onChange();
  }

  const receiptCounts = {
    all: receipts.length,
    warranty: receipts.filter((receipt) => Boolean(receipt.file_path || receipt.file_url)).length,
    matched: receipts.filter((receipt) => receipt.matched_status === "matched").length,
    manual: receipts.filter((receipt) => receipt.matched_status !== "matched").length,
  };
  const hasActiveFilters = Boolean(searchQuery.trim()) || receiptFilter !== "all";
  const receiptCandidates = findReceiptCandidates(merchant, total, receiptDate);
  const filteredReceipts = receipts.filter((receipt) => {
    const searchText = `${receipt.merchant || ""} ${receipt.ai_summary || ""} ${receipt.receipt_date || ""}`.toLowerCase();
    const matchesSearch = !searchQuery.trim() || searchText.includes(searchQuery.trim().toLowerCase());
    const matchesFilter =
      receiptFilter === "all"
        ? true
        : receiptFilter === "warranty"
        ? Boolean(receipt.file_path || receipt.file_url)
        : receiptFilter === "matched"
        ? receipt.matched_status === "matched"
        : receipt.matched_status !== "matched";
    return matchesSearch && matchesFilter;
  });

  const emptyStateText = receipts.length === 0
    ? "No receipts stored yet. Save one above and this becomes your warranty drawer."
    : searchQuery.trim()
    ? "No receipts match that search yet. Try a broader search or show all receipts."
    : receiptFilter === "warranty"
    ? "No warranty or kept-file receipts are stored yet."
    : receiptFilter === "matched"
    ? "No matched receipts yet. Once totals and dates line up, they show here."
    : receiptFilter === "manual"
    ? "No unmatched receipts right now."
    : "No receipts match that view yet.";

  function clearReceiptFilters() {
    setSearchQuery("");
    setReceiptFilter("all");
  }

  async function showReceipt(receipt) {
    setViewerError("");

    try {
      const url = receipt.file_path
        ? await getSignedStorageUrl(supabase, "receipts", receipt.file_path)
        : receipt.file_url;

      setViewerReceipt({
        title: receipt.merchant || "Receipt",
        url,
        type: receipt.file_type || "",
      });
    } catch (error) {
      setViewerError(error.message || "Could not show that receipt.");
    }
  }

  return (
    <>
      <Notice notice={notice} styles={styles} onClose={() => setNotice(null)} />
      <Section
        title="Receipt Scanner"
        styles={styles}
        right={
          <button
            style={styles.ghostBtn}
            onClick={() =>
              onGoToCoach(
                "Help me set up a simple receipt system for warranties, returns, and proof of purchase using the app I already have.",
                { autoSend: true }
              )
            }
          >
            Ask AI how to use this
          </button>
        }
      >
        <p style={styles.sectionIntro}>
          Save receipts with a proper name so you can actually find them later for returns, warranties, or proof of purchase.
        </p>

        <input
          style={styles.input}
          type="file"
          accept="image/*,.pdf"
          onChange={handleFileChange}
        />

        {file && (
          <div style={styles.receiptPreview}>
            <strong>{file.name}</strong>
            <p style={styles.transactionMeta}>
              {file.type || "Unknown file type"} - {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        )}

        <label style={styles.checkRow}>
          <input
            type="checkbox"
            checked={keepFile}
            onChange={(e) => setKeepFile(e.target.checked)}
          />
          <span>Keep image/PDF for warranty or returns</span>
        </label>

        <input
          style={styles.input}
          placeholder="Receipt name or merchant, e.g. AirPods Pro / Tesco"
          value={merchant}
          onChange={(e) => updateMerchant(e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="Total"
          type="text"
          inputMode="decimal"
          value={total}
          onChange={(e) => updateTotal(e.target.value)}
        />

        <input
          style={styles.input}
          type="date"
          value={receiptDate}
          onChange={(e) => updateDate(e.target.value)}
        />

        {match && (
          <div style={styles.matchBox}>
            <strong>Matched transaction found</strong>
            <p style={styles.transactionMeta}>
              {match.description} - {match.transaction_date} - {formatCurrency(Math.abs(Number(match.amount || 0)))}
            </p>
          </div>
        )}

        {!match && receiptCandidates.length > 0 ? (
          <div style={styles.matchBox}>
            <strong>Possible payment matches</strong>
            <p style={styles.transactionMeta}>Pick the payment this receipt belongs to.</p>
            <div style={styles.inlineBtnRow}>
              {receiptCandidates.map((candidate) => (
                <button
                  key={candidate.id || `${candidate.transaction_date}-${candidate.description}-${candidate.amount}`}
                  type="button"
                  style={styles.secondaryInlineBtn}
                  onClick={() => setMatch(candidate)}
                >
                  {candidate.description} - {formatCurrency(Math.abs(Number(candidate.amount || 0)))}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <button style={styles.primaryBtn} onClick={addReceipt} disabled={saving}>
          {saving ? "Saving..." : match ? "Save Matched Receipt" : "Save Receipt"}
        </button>
      </Section>

      {receipts.length > 0 ? (
        <>
          <Section title="Find A Receipt Later" styles={styles}>
            <input
              style={styles.input}
              placeholder="Search by receipt name, merchant, or date"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <p style={styles.smallMuted}>
              Saved {receiptCounts.all} - Warranty kept {receiptCounts.warranty} - Matched {receiptCounts.matched}
            </p>
            <div style={styles.actionChipWrap}>
              {[
                ["all", "All receipts"],
                ["warranty", "Warranty / kept files"],
                ["matched", "Matched"],
                ["manual", "Unmatched"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  style={{ ...styles.promptChip, ...(receiptFilter === key ? styles.modeChipActive : null) }}
                  onClick={() => setReceiptFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>

          <Section
            title={hasActiveFilters ? `Saved Receipts (${filteredReceipts.length} of ${receipts.length})` : `Saved Receipts (${receipts.length})`}
            styles={styles}
            right={
              hasActiveFilters ? (
                <button style={styles.ghostBtn} type="button" onClick={clearReceiptFilters}>
                  Show all receipts
                </button>
              ) : null
            }
          >
            {filteredReceipts.length === 0 ? (
              <div>
                <p style={styles.emptyText}>{emptyStateText}</p>
                {hasActiveFilters ? (
                  <div style={styles.inlineBtnRow}>
                    <button style={styles.secondaryInlineBtn} type="button" onClick={clearReceiptFilters}>
                      Show all receipts
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              filteredReceipts.map((receipt) => (
                <div key={receipt.id} style={styles.signalCard}>
                  <div style={styles.signalHeader}>
                    <div>
                      <strong>{receipt.merchant || "Receipt"}</strong>
                      <p style={styles.transactionMeta}>
                        {receipt.receipt_date || "No date"} - {receipt.matched_status === "matched" ? "Matched" : "Unmatched"} - {receipt.file_path || receipt.file_url ? "File saved" : "Details only"}
                      </p>
                    </div>
                    <strong>{formatCurrency(receipt.total || 0)}</strong>
                  </div>
                  {receipt.ai_summary ? <p style={styles.signalBody}>{receipt.ai_summary}</p> : null}
                  <div style={styles.inlineBtnRow}>
                    {receipt.file_path || receipt.file_url ? (
                      <button
                        style={styles.secondaryInlineBtn}
                        type="button"
                        onClick={() => showReceipt(receipt)}
                      >
                        Show receipt
                      </button>
                    ) : null}
                    <button
                      style={styles.secondaryInlineBtn}
                      type="button"
                      onClick={() =>
                        onGoToCoach(
                          `Help me work out whether I should keep this receipt and what it is most useful for: ${receipt.merchant || "Receipt"} for ${formatCurrency(receipt.total || 0)} on ${receipt.receipt_date || "unknown date"}.`,
                          { autoSend: true }
                        )
                      }
                    >
                      Ask AI
                    </button>
                  </div>
                </div>
              ))
            )}
          </Section>
        </>
      ) : (
        <Section title="Saved Receipts (0)" styles={styles}>
          <p style={styles.emptyText}>No receipts saved yet. Once you keep one, this becomes the place to find warranty proof, return receipts, and old purchases fast.</p>
        </Section>
      )}

      {viewerReceipt ? (
        <Section
          title={viewerReceipt.title}
          styles={styles}
          right={
            <button style={styles.ghostBtn} type="button" onClick={() => setViewerReceipt(null)}>
              Close
            </button>
          }
        >
          {viewerError ? <p style={styles.errorNote}>{viewerError}</p> : null}
          {viewerReceipt.type.startsWith("image/") || viewerReceipt.url.includes(".webp") ? (
            <img
              src={viewerReceipt.url}
              alt={viewerReceipt.title}
              style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 12 }}
            />
          ) : (
            <iframe
              title={viewerReceipt.title}
              src={viewerReceipt.url}
              style={{ width: "100%", minHeight: "70vh", border: "1px solid #dbe4f0", borderRadius: 12 }}
            />
          )}
        </Section>
      ) : null}
    </>
  );
}
