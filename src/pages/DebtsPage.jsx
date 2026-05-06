import { useMemo, useState } from "react";
import { supabase } from "../supabase";
import { MiniCard, Notice, Row, Section } from "../components/ui";
import { formatCurrency, intOrNull, normalizeText, numberOrNull } from "../lib/finance";
import {
  buildPrivateStoragePath,
  prepareSensitiveUploadFile,
  validateSensitiveFileContent,
} from "../lib/security";
import { fileToDataUrl } from "../lib/calendarIntelligence";
import { getFunctionErrorMessage } from "../lib/functionErrors";
import {
  getDebtPortfolioSnapshot,
  getDebtProgressSummary,
  getTrendSummary,
  hasMeaningfulExtraction,
} from "../lib/dashboardIntelligence";
import {
  buildDebtDedupeKey,
  buildKeywords,
  getDebtMatchSummary,
  getDebtMonthlyStatus,
  getDebtSignals,
  hasMatchingDebt,
} from "../lib/statementSignals";
import { getStatusPillStyle } from "../lib/styleHelpers";

export default function DebtsPage({
  debts,
  transactions,
  moneyUnderstanding,
  appMoneyModel,
  documents,
  onChange,
  onDocumentsChange,
  viewerMode,
  styles,
}) {
  const debtSignals = useMemo(() => getDebtSignals(transactions), [transactions]);
  const trendSummary = useMemo(() => getTrendSummary(transactions), [transactions]);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [aiText, setAiText] = useState("");
  const [documentFile, setDocumentFile] = useState(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState({
    name: "",
    lender: "",
    starting_balance: "",
    current_balance: "",
    minimum_payment: "",
    due_day: "",
    interest_rate: "",
    notes: "",
  });

  const unlinkedSignals = debtSignals.filter((signal) => !hasMatchingDebt(signal, debts));
  const totalDetectedPayments = debtSignals.reduce((sum, item) => sum + item.total, 0);
  const debtTrendLabel = debts.length || unlinkedSignals.length || totalDetectedPayments > 0 ? trendSummary.label : "Quiet";
  const debtSnapshot = getDebtPortfolioSnapshot(debts, transactions);
  const calendarDebtBills = (moneyUnderstanding?.billStreams || []).filter((stream) =>
    /debt|loan|credit|finance/i.test(`${stream.kind || ""} ${stream.name || ""}`)
  );
  const calendarDebtMonthly = calendarDebtBills.reduce((sum, stream) => sum + Math.abs(Number(stream.amount || 0)), 0);
  const safeExtraPayment = Math.max(Number(appMoneyModel?.savingsCapacity?.safeMonthlyAmount || 0), 0);

  function fillFromSignal(signal) {
    setForm({
      name: signal.label,
      lender: signal.label,
      starting_balance: "",
      current_balance: "",
      minimum_payment: signal.average.toFixed(2),
      due_day: signal.suggestedDay ? String(signal.suggestedDay) : "",
      interest_rate: "",
      notes: `Created from imported statement signal: ${signal.label}`,
    });
  }

  async function chooseDebtDocument(nextFile, input) {
    if (!nextFile) {
      setDocumentFile(null);
      return;
    }
    const validation = await validateSensitiveFileContent(nextFile);
    if (!validation.ok) {
      setNotice({ tone: "bad", message: "That file does not look like a debt document. Upload a clear photo, image, or PDF." });
      if (input) input.value = "";
      setDocumentFile(null);
      return;
    }
    setDocumentFile(nextFile);
  }

  async function runAiDebtParse() {
    if (!aiText.trim()) return;

    setAiBusy(true);
    setAiNote("");

    try {
      const contextSignals = unlinkedSignals.slice(0, 5).map((signal) => ({
        label: signal.label,
        average: signal.average,
        count: signal.count,
        suggested_day: signal.suggestedDay,
      }));

      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          mode: "extract_debt",
          message: aiText.trim(),
          context: {
            debt_signals: contextSignals,
          },
        },
      });

      if (error) throw new Error(await getFunctionErrorMessage(error, "Debt AI is busy right now. Try again later."));

      const extracted = data?.extracted || {};
      if (!hasMeaningfulExtraction(extracted)) {
        throw new Error("The document was uploaded, but nothing usable was extracted from the image.");
      }
      setForm({
        name: extracted.name || "",
        lender: extracted.lender || "",
        starting_balance: extracted.starting_balance != null ? String(extracted.starting_balance) : "",
        current_balance: extracted.current_balance != null ? String(extracted.current_balance) : "",
        minimum_payment: extracted.minimum_payment != null ? String(extracted.minimum_payment) : "",
        due_day: extracted.due_day != null ? String(extracted.due_day) : "",
        interest_rate: extracted.interest_rate != null ? String(extracted.interest_rate) : "",
        notes: extracted.notes || `AI setup: ${aiText.trim()}`,
      });
      setAiNote(data?.message || "AI filled the debt form. Check it before saving.");
    } catch (error) {
      setAiNote(error.message || "Could not understand that debt yet.");
    } finally {
      setAiBusy(false);
    }
  }

  async function uploadDebtDocument() {
    if (!documentFile) return;

    setDocumentBusy(true);
    setAiNote("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const validation = await validateSensitiveFileContent(documentFile);
      if (!validation.ok) throw new Error(validation.message);

      const uploadFile = await prepareSensitiveUploadFile(documentFile, {
        maxDimension: 1600,
        quality: 0.7,
      });
      const filePath = buildPrivateStoragePath(user.id, "documents/debt", uploadFile.name);
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(filePath, uploadFile, {
          cacheControl: "private, max-age=0, no-store",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const documentDataUrl = uploadFile.type.startsWith("image/")
        ? await fileToDataUrl(uploadFile)
        : null;
      const documentInsertPayload = {
        user_id: user.id,
        record_type: "debt",
        file_name: documentFile.name,
        file_path: filePath,
        file_url: null,
        file_type: uploadFile.type || documentFile.type || null,
        extraction_status: uploadFile.type.startsWith("image/") ? "processing" : "uploaded",
      };

      if (!uploadFile.type.startsWith("image/")) {
        try {
          await supabase.from("financial_documents").insert(documentInsertPayload);
          await onDocumentsChange();
        } catch {
          // Let the upload continue even if the document log is blocked by RLS.
        }
        setAiNote("Document saved. AI extraction currently works best from screenshots or photos.");
        setDocumentFile(null);
        return;
      }

      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          mode: "extract_debt_document",
          message: aiText.trim(),
          context: {
            document_path: filePath,
            document_name: documentFile.name,
            document_data_url: documentDataUrl,
          },
        },
      });

      if (error) throw new Error(await getFunctionErrorMessage(error, "Debt document AI is busy right now. Try again later."));

      const extracted = data?.extracted || {};
      if (!hasMeaningfulExtraction(extracted)) {
        throw new Error("The document was uploaded, but nothing usable was extracted from the image.");
      }

      setForm((prev) => ({
        name: extracted.name || prev.name,
        lender: extracted.lender || prev.lender,
        starting_balance:
          extracted.starting_balance != null ? String(extracted.starting_balance) : prev.starting_balance,
        current_balance:
          extracted.current_balance != null ? String(extracted.current_balance) : prev.current_balance,
        minimum_payment:
          extracted.minimum_payment != null ? String(extracted.minimum_payment) : prev.minimum_payment,
        due_day: extracted.due_day != null ? String(extracted.due_day) : prev.due_day,
        interest_rate:
          extracted.interest_rate != null ? String(extracted.interest_rate) : prev.interest_rate,
        notes: extracted.notes || prev.notes,
      }));

      try {
        await supabase.from("financial_documents").insert({
          ...documentInsertPayload,
          extraction_status: "extracted",
          extraction_summary: data?.message || "AI filled the debt form from the document.",
          extracted_json: extracted,
        });
        await onDocumentsChange();
      } catch {
        // Extraction succeeded, so don't block the form fill if logging fails.
      }

      setAiNote(data?.message || "AI filled the debt form from the document.");
      setDocumentFile(null);
    } catch (error) {
      setAiNote(error.message || "Could not extract from that document.");
    } finally {
      setDocumentBusy(false);
    }
  }

  async function saveDebt(extra = {}) {
    if (viewerMode) {
      setNotice({ tone: "warn", message: "Viewer mode is on. Turn it off before editing debts." });
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        user_id: user.id,
        name: String(extra.name ?? form.name).trim(),
        lender: String(extra.lender ?? form.lender).trim(),
        starting_balance: numberOrNull(extra.starting_balance ?? form.starting_balance),
        current_balance: numberOrNull(extra.current_balance ?? form.current_balance),
        minimum_payment: numberOrNull(extra.minimum_payment ?? form.minimum_payment),
        due_day: intOrNull(extra.due_day ?? form.due_day),
        interest_rate: numberOrNull(extra.interest_rate ?? form.interest_rate),
        notes: String(extra.notes ?? form.notes).trim() || null,
        status: "active",
        source: extra.source || "manual",
        detection_confidence: extra.detection_confidence ?? 0,
        payment_keywords:
          extra.payment_keywords ||
          buildKeywords(extra.lender ?? form.lender, extra.name ?? form.name),
        updated_at: new Date().toISOString(),
      };

      if (!payload.name) {
        setNotice({ tone: "warn", message: "Add the debt name first, like Barclaycard or car finance." });
        setSaving(false);
        return;
      }

      payload.dedupe_key = buildDebtDedupeKey(payload);

      const { error } = await supabase.from("debts").upsert(payload, {
        onConflict: "user_id,dedupe_key",
      });

      if (error) throw error;

      setForm({
        name: "",
        lender: "",
        starting_balance: "",
        current_balance: "",
        minimum_payment: "",
        due_day: "",
        interest_rate: "",
        notes: "",
      });
      setAiText("");
      setAiNote("");

      await onChange();
      setNotice({ tone: "good", message: "Debt saved. If it was already there, Money Hub updated it instead of adding a duplicate." });
    } catch (error) {
      setNotice({ tone: "bad", message: error.message || "We could not save that debt. Nothing was changed." });
    } finally {
      setSaving(false);
    }
  }

  async function saveSignalAsDebt(signal) {
    await saveDebt({
      name: signal.label,
      lender: signal.label,
      minimum_payment: signal.average.toFixed(2),
      due_day: signal.suggestedDay || null,
      notes: `Created from statement signal. ${signal.count} matching payment(s) detected.`,
      source: "statement_signal",
      detection_confidence: 0.82,
      payment_keywords: [normalizeText(signal.label)],
    });
  }

  return (
    <>
      <Notice notice={notice} styles={styles} onClose={() => setNotice(null)} />
      <Section styles={styles} title="Debt Tracker">
        <p style={styles.sectionIntro}>
          Money Hub looks for loan, finance, card and overdraft payments, then keeps extra repayments behind bills and normal spending.
        </p>
      </Section>

      <div style={styles.grid}>
        <MiniCard styles={styles} title="Debts" value={`${debts.length}`} />
        <MiniCard styles={styles} title="Possible debts" value={`${unlinkedSignals.length}`} />
        <MiniCard styles={styles} title="Paid out" value={formatCurrency(totalDetectedPayments)} />
        <MiniCard styles={styles} title="Trend" value={debtTrendLabel} />
      </div>

      <Section styles={styles} title="Debt Snapshot">
        <div style={styles.grid}>
          <MiniCard styles={styles} title="Balance" value={formatCurrency(debtSnapshot.totalBalance)} />
          <MiniCard styles={styles} title="Minimums" value={formatCurrency(debtSnapshot.totalMinimum)} />
          <MiniCard styles={styles} title="Calendar debt bills" value={formatCurrency(calendarDebtMonthly)} />
          <MiniCard styles={styles} title="Paid This Month" value={formatCurrency(debtSnapshot.totalPaidThisMonth)} />
          <MiniCard styles={styles} title="Behind" value={`${debtSnapshot.behindCount}`} />
        </div>
        <p style={styles.sectionIntro}>
          {safeExtraPayment > 0
            ? `A cautious extra debt payment should stay under ${formatCurrency(safeExtraPayment)} unless your current balance says otherwise.`
            : "No extra debt payment looks safe yet. Cover Calendar bills first, then check this again."}
        </p>
      </Section>

      <Section styles={styles} title="Tell AI About A Debt">
        <p style={styles.sectionIntro}>
          Example: I borrowed £5,000 from Barclays, minimum payment £145, due on
          the 12th, around 19.9% interest.
        </p>

        <textarea
          style={styles.textarea}
          placeholder="Describe the debt in plain English..."
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
        />

        <div style={styles.inlineBtnRow}>
          <button
            style={styles.primaryInlineBtn}
            onClick={runAiDebtParse}
            disabled={aiBusy || !aiText.trim()}
          >
            {aiBusy ? "Thinking..." : "Let AI Fill Debt Form"}
          </button>
        </div>

        {aiNote ? <p style={styles.smallMuted}>{aiNote}</p> : null}
      </Section>

      <Section styles={styles} title="Upload Debt Document">
        <p style={styles.sectionIntro}>
          Upload a screenshot or photo of a statement, agreement, or finance screen.
          Images can be read by AI directly; PDFs are stored but are less reliable for extraction right now.
        </p>
        <input
          style={styles.input}
          type="file"
          accept="image/*,.pdf"
          onChange={async (e) => {
            const nextFile = e.target.files?.[0] || null;
            await chooseDebtDocument(nextFile, e.target);
          }}
        />
        {documentFile ? <p style={styles.smallMuted}>{documentFile.name}</p> : null}
        {aiNote ? <p style={styles.smallMuted}>{aiNote}</p> : null}
        <button
          style={styles.primaryBtn}
          onClick={uploadDebtDocument}
          disabled={documentBusy || !documentFile}
        >
          {documentBusy ? "Extracting..." : "Upload And Extract"}
        </button>
      </Section>

      <Section styles={styles} title="Debt Payments Money Hub Found">
        {unlinkedSignals.length === 0 ? (
          <p style={styles.emptyText}>
            No possible debt payments need checking right now. If you do have a loan or card, upload more history or add it above.
          </p>
        ) : (
          unlinkedSignals.map((signal) => (
            <div key={signal.key} style={styles.signalCard}>
              <div style={styles.signalHeader}>
                <div>
                  <strong>{signal.label}</strong>
                  <p style={styles.transactionMeta}>
                    {signal.count} payment{signal.count === 1 ? "" : "s"} spotted · avg £
                    {signal.average.toFixed(2)} · around day {signal.suggestedDay || "?"}
                  </p>
                </div>
                <strong>£{signal.total.toFixed(2)}</strong>
              </div>

              <div style={styles.inlineBtnRow}>
                <button
                  style={styles.secondaryInlineBtn}
                  onClick={() => fillFromSignal(signal)}
                >
                  Use In Form
                </button>
                <button
                  style={styles.primaryInlineBtn}
                  onClick={() => saveSignalAsDebt(signal)}
                  disabled={saving || viewerMode}
                >
                  Save As Debt
                </button>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section styles={styles} title="Add Or Confirm Debt">
        <input
          style={styles.input}
          placeholder="Debt name, e.g. Barclaycard"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Lender"
          value={form.lender}
          onChange={(e) => setForm((prev) => ({ ...prev, lender: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Starting balance"
          type="text" inputMode="decimal"
          value={form.starting_balance}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, starting_balance: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Current balance"
          type="text" inputMode="decimal"
          value={form.current_balance}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, current_balance: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Minimum monthly payment"
          type="text" inputMode="decimal"
          value={form.minimum_payment}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, minimum_payment: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Due day of month"
          type="text" inputMode="decimal"
          value={form.due_day}
          onChange={(e) => setForm((prev) => ({ ...prev, due_day: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Interest rate %"
          type="text" inputMode="decimal"
          value={form.interest_rate}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, interest_rate: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
        />

        <button style={styles.primaryBtn} onClick={() => saveDebt()} disabled={saving || viewerMode}>
          {viewerMode ? "Viewer mode on" : saving ? "Saving..." : "Save Debt"}
        </button>
      </Section>

      <Section styles={styles} title="Saved Debts">
        {debts.length === 0 ? (
          <p style={styles.emptyText}>No debts saved yet.</p>
        ) : (
          debts.map((debt) => {
            const match = getDebtMatchSummary(debt, transactions);
            const status = getDebtMonthlyStatus(debt, transactions);
            const progress = getDebtProgressSummary(debt, transactions);
            return (
              <div key={debt.id} style={styles.signalCard}>
                <div style={styles.signalHeader}>
                  <div>
                    <strong>{debt.name}</strong>
                    <p style={styles.transactionMeta}>
                      {debt.lender || "No lender"} · {debt.status || "active"} · source {debt.source || "manual"}
                    </p>
                  </div>
                  <strong>
                    {debt.current_balance != null
                      ? `£${Number(debt.current_balance).toFixed(2)}`
                      : "Balance later"}
                  </strong>
                </div>
                <p style={styles.signalBody}>
                  Min payment: {debt.minimum_payment != null ? `£${Number(debt.minimum_payment).toFixed(2)}` : "not set"}
                  {" · "}
                  Due day: {debt.due_day || "not set"}
                  {" · "}
                  Matched payments: {match.count}
                  {" · "}
                  Last seen: {match.lastDate || "not found yet"}
                </p>
                <p style={styles.signalBody}>
                  This month: {progress.monthlyPaidLabel}
                  {" · "}
                  Pace: {progress.paceLabel}
                  {" · "}
                  Payoff read: {progress.payoffLabel}
                </p>
                <div style={styles.statusPillRow}>
                  <span style={getStatusPillStyle(status.tone)}>{status.label}</span>
                </div>
              </div>
            );
          })
        )}
      </Section>

      {documents.length > 0 ? (
        <Section styles={styles} title="Recent Debt Documents">
          {documents.slice(0, 5).map((doc) => (
            <Row
              styles={styles}
              key={doc.id}
              name={doc.file_name || "Debt document"}
              value={doc.extraction_status || "uploaded"}
            />
          ))}
        </Section>
      ) : null}
    </>
  );
}

