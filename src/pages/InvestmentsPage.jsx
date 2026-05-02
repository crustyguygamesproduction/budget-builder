import { useMemo, useState } from "react";
import { supabase } from "../supabase";
import { MiniCard, Row, Section } from "../components/ui";
import { formatCurrency, normalizeText, numberOrNull } from "../lib/finance";
import { buildPrivateStoragePath, prepareSensitiveUploadFile, validateSensitiveFile } from "../lib/security";
import { fileToDataUrl } from "../lib/calendarIntelligence";
import {
  getInvestmentPerformanceSummary,
  getInvestmentPortfolioSnapshot,
  hasMeaningfulExtraction,
} from "../lib/dashboardIntelligence";
import {
  buildInvestmentDedupeKey,
  buildKeywords,
  formatInvestmentSignalMeta,
  formatInvestmentSignalNet,
  getInvestmentMatchSummary,
  getInvestmentMonthlyStatus,
  getInvestmentSignalNote,
  getInvestmentSignals,
  hasMatchingInvestment,
} from "../lib/statementSignals";
import { getStatusPillStyle } from "../lib/styleHelpers";

export default function InvestmentsPage({
  investments,
  transactions,
  appMoneyModel,
  documents,
  onChange,
  onDocumentsChange,
  viewerMode,
  styles,
}) {
  const investmentSignals = useMemo(() => getInvestmentSignals(transactions), [transactions]);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [aiText, setAiText] = useState("");
  const [documentFile, setDocumentFile] = useState(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [quoteBusyKey, setQuoteBusyKey] = useState("");
  const [form, setForm] = useState({
    name: "",
    platform: "",
    asset_type: "general",
    current_value: "",
    monthly_contribution: "",
    risk_level: "",
    ticker_symbol: "",
    units_owned: "",
    total_contributed: "",
    cost_basis: "",
    notes: "",
  });

  const unlinkedSignals = investmentSignals.filter(
    (signal) => !hasMatchingInvestment(signal, investments)
  );
  const totalDetectedInvesting = investmentSignals.reduce(
    (sum, item) => sum + Math.max(Number(item.netContributed ?? item.total ?? 0), 0),
    0
  );
  const investmentSnapshot = getInvestmentPortfolioSnapshot(investments);
  const safeInvestingRoom = Math.max(Number(appMoneyModel?.savingsCapacity?.safeMonthlyAmount || 0), 0);
  const billsFirstWarning = safeInvestingRoom <= 0 || appMoneyModel?.income?.confidence === "low";

  function fillFromSignal(signal) {
    setForm({
      name: signal.label,
      platform: signal.label,
      asset_type: "general",
      current_value: "",
      monthly_contribution: signal.average.toFixed(2),
      risk_level: "",
      ticker_symbol: "",
      units_owned: "",
      total_contributed:
        signal.netContributed > 0 ? signal.netContributed.toFixed(2) : "",
      cost_basis: "",
      notes: getInvestmentSignalNote(signal),
    });
  }

  async function runAiInvestmentParse() {
    if (!aiText.trim()) return;

    setAiBusy(true);
    setAiNote("");

    try {
      const contextSignals = unlinkedSignals.slice(0, 5).map((signal) => ({
        label: signal.label,
        average: signal.average,
        count: signal.count,
      }));

      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          mode: "extract_investment",
          message: aiText.trim(),
          context: {
            investment_signals: contextSignals,
          },
        },
      });

      if (error) throw new Error(error.message || "AI parse failed.");

      const extracted = data?.extracted || {};
      setForm({
        name: extracted.name || "",
        platform: extracted.platform || "",
        asset_type: extracted.asset_type || "general",
        current_value: extracted.current_value != null ? String(extracted.current_value) : "",
        monthly_contribution:
          extracted.monthly_contribution != null ? String(extracted.monthly_contribution) : "",
        risk_level: extracted.risk_level || "",
        ticker_symbol: extracted.ticker_symbol || "",
        units_owned: extracted.units_owned != null ? String(extracted.units_owned) : "",
        total_contributed: extracted.total_contributed != null ? String(extracted.total_contributed) : "",
        cost_basis: extracted.cost_basis != null ? String(extracted.cost_basis) : "",
        notes: extracted.notes || `AI setup: ${aiText.trim()}`,
      });
      setAiNote(data?.message || "AI filled the investment form. Check it before saving.");
    } catch (error) {
      setAiNote(error.message || "Could not understand that investment yet.");
    } finally {
      setAiBusy(false);
    }
  }

  async function uploadInvestmentDocument() {
    if (!documentFile) return;

    setDocumentBusy(true);
    setAiNote("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const validation = validateSensitiveFile(documentFile);
      if (!validation.ok) throw new Error(validation.message);

      const uploadFile = await prepareSensitiveUploadFile(documentFile, {
        maxDimension: 1600,
        quality: 0.7,
      });
      const filePath = buildPrivateStoragePath(user.id, "documents/investment", uploadFile.name);
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
        record_type: "investment",
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
          mode: "extract_investment_document",
          message: aiText.trim(),
          context: {
            document_path: filePath,
            document_name: documentFile.name,
            document_data_url: documentDataUrl,
          },
        },
      });

      if (error) throw new Error(error.message || "Document extraction failed.");

      const extracted = data?.extracted || {};
      if (!hasMeaningfulExtraction(extracted)) {
        throw new Error("The document was uploaded, but nothing usable was extracted from the image.");
      }

      setForm((prev) => ({
        name: extracted.name || prev.name,
        platform: extracted.platform || prev.platform,
        asset_type: extracted.asset_type || prev.asset_type,
        current_value:
          extracted.current_value != null ? String(extracted.current_value) : prev.current_value,
        monthly_contribution:
          extracted.monthly_contribution != null
            ? String(extracted.monthly_contribution)
            : prev.monthly_contribution,
        risk_level: extracted.risk_level || prev.risk_level,
        ticker_symbol: extracted.ticker_symbol || prev.ticker_symbol,
        units_owned: extracted.units_owned != null ? String(extracted.units_owned) : prev.units_owned,
        total_contributed:
          extracted.total_contributed != null ? String(extracted.total_contributed) : prev.total_contributed,
        cost_basis: extracted.cost_basis != null ? String(extracted.cost_basis) : prev.cost_basis,
        notes: extracted.notes || prev.notes,
      }));

      try {
        await supabase.from("financial_documents").insert({
          ...documentInsertPayload,
          extraction_status: "extracted",
          extraction_summary: data?.message || "AI filled the investment form from the document.",
          extracted_json: extracted,
        });
        await onDocumentsChange();
      } catch {
        // Extraction succeeded, so don't block the form fill if logging fails.
      }

      setAiNote(data?.message || "AI filled the investment form from the document.");
      setDocumentFile(null);
    } catch (error) {
      setAiNote(error.message || "Could not extract from that document.");
    } finally {
      setDocumentBusy(false);
    }
  }

  async function refreshPrice(investment) {
    if (!investment.ticker_symbol && investment.asset_type !== "crypto") {
      alert("Add a ticker symbol first, e.g. VUAG.L or BTC.");
      return;
    }

    setQuoteBusyKey(investment.id);

    try {
      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          mode: "market_price",
          message: investment.ticker_symbol || investment.name,
          context: {
            asset_type: investment.asset_type,
            ticker_symbol: investment.ticker_symbol,
            platform: investment.platform,
            name: investment.name,
          },
        },
      });

      if (error) throw new Error(error.message || "Price refresh failed.");
      if (!data?.price) throw new Error("No live price came back for that symbol.");

      const { error: updateError } = await supabase
        .from("investments")
        .update({
          live_price: data.price,
          live_price_currency: data.currency || "GBP",
          live_price_updated_at: new Date().toISOString(),
          price_source: data.source || "live",
        })
        .eq("id", investment.id);

      if (updateError) throw updateError;
      await onChange();
    } catch (error) {
      alert(error.message || "Could not refresh price.");
    } finally {
      setQuoteBusyKey("");
    }
  }

  async function saveInvestment(extra = {}) {
    if (viewerMode) {
      alert("Viewer mode is on. Turn it off to edit investments.");
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
        platform: String(extra.platform ?? form.platform).trim(),
        asset_type: String(extra.asset_type ?? form.asset_type).trim() || "general",
        current_value: numberOrNull(extra.current_value ?? form.current_value),
        monthly_contribution: numberOrNull(
          extra.monthly_contribution ?? form.monthly_contribution
        ),
        risk_level: String(extra.risk_level ?? form.risk_level).trim() || null,
        ticker_symbol: String(extra.ticker_symbol ?? form.ticker_symbol).trim() || null,
        units_owned: numberOrNull(extra.units_owned ?? form.units_owned),
        total_contributed: numberOrNull(extra.total_contributed ?? form.total_contributed),
        cost_basis: numberOrNull(extra.cost_basis ?? form.cost_basis),
        notes: String(extra.notes ?? form.notes).trim() || null,
        status: "active",
        source: extra.source || "manual",
        detection_confidence: extra.detection_confidence ?? 0,
        contribution_keywords:
          extra.contribution_keywords ||
          buildKeywords(extra.platform ?? form.platform, extra.name ?? form.name),
        updated_at: new Date().toISOString(),
      };

      if (!payload.name) {
        alert("Add an investment name first.");
        setSaving(false);
        return;
      }

      payload.dedupe_key = buildInvestmentDedupeKey(payload);

      const { error } = await supabase.from("investments").upsert(payload, {
        onConflict: "user_id,dedupe_key",
      });

      if (error) throw error;

      setForm({
        name: "",
        platform: "",
        asset_type: "general",
        current_value: "",
        monthly_contribution: "",
        risk_level: "",
        ticker_symbol: "",
        units_owned: "",
        total_contributed: "",
        cost_basis: "",
        notes: "",
      });
      setAiText("");
      setAiNote("");

      await onChange();
      alert(
        "Investment saved. If it already existed, the record was updated instead of duplicated."
      );
    } catch (error) {
      alert(error.message || "Could not save investment.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSignalAsInvestment(signal) {
    const netContributed = Math.max(Number(signal.netContributed ?? signal.total ?? 0), 0);
    await saveInvestment({
      name: signal.label,
      platform: signal.label,
      monthly_contribution: signal.average.toFixed(2),
      total_contributed: netContributed > 0 ? netContributed.toFixed(2) : null,
      notes: getInvestmentSignalNote(signal),
      source: "statement_signal",
      detection_confidence: 0.82,
      contribution_keywords: [normalizeText(signal.label)],
    });
  }

  return (
    <>
      <Section styles={styles} title="Investment Tracker">
        <p style={styles.sectionIntro}>
          Money Hub separates investing from normal spending and only encourages more when bills and usual spending look safe.
        </p>
      </Section>

      <div style={styles.grid}>
        <MiniCard styles={styles} title="Investments" value={`${investments.length}`} />
        <MiniCard styles={styles} title="Possible matches" value={`${unlinkedSignals.length}`} />
        <MiniCard styles={styles} title="Net Put In" value={formatCurrency(totalDetectedInvesting)} />
        <MiniCard styles={styles} title="Status" value={investments.length ? "Tracking" : "Building"} />
      </div>

      <Section styles={styles} title="Portfolio Snapshot">
        <div style={styles.grid}>
          <MiniCard styles={styles} title="Value" value={formatCurrency(investmentSnapshot.marketValue)} />
          <MiniCard styles={styles} title="Contributed" value={formatCurrency(investmentSnapshot.totalContributed)} />
          <MiniCard styles={styles} title="Gain/Loss" value={`${investmentSnapshot.gainLoss >= 0 ? "+" : "-"}${formatCurrency(Math.abs(investmentSnapshot.gainLoss))}`} />
          <MiniCard styles={styles} title="Prices added" value={`${investmentSnapshot.pricedCount}`} />
        </div>
        <p style={styles.sectionIntro}>
          {billsFirstWarning
            ? "Do not increase investing yet. Money Hub cannot see safe spare money after Calendar bills and usual spending."
            : `Keep regular investing under the shared safe amount of ${formatCurrency(safeInvestingRoom)} unless you know your current cash is stronger.`}
        </p>
      </Section>

      <Section styles={styles} title="Tell AI About An Investment">
        <p style={styles.sectionIntro}>
          Example: I put £250 a month into Vanguard for an ISA and it is worth about £4,800 now.
        </p>

        <textarea
          style={styles.textarea}
          placeholder="Describe the investment in plain English..."
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
        />

        <div style={styles.inlineBtnRow}>
          <button
            style={styles.primaryInlineBtn}
            onClick={runAiInvestmentParse}
            disabled={aiBusy || !aiText.trim()}
          >
            {aiBusy ? "Thinking..." : "Let AI Fill Investment Form"}
          </button>
        </div>

        {aiNote ? <p style={styles.smallMuted}>{aiNote}</p> : null}
      </Section>

      <Section styles={styles} title="Upload Investment Document">
        <p style={styles.sectionIntro}>
          Upload a screenshot of your broker app, crypto wallet, or portfolio screen.
          Images can be read by AI directly; PDFs are stored but are less reliable for extraction right now.
        </p>
        <input
          style={styles.input}
          type="file"
          accept="image/*,.pdf"
          onChange={(e) => {
            const nextFile = e.target.files?.[0] || null;
            if (!nextFile) {
              setDocumentFile(null);
              return;
            }
            const validation = validateSensitiveFile(nextFile);
            if (!validation.ok) {
              alert(validation.message);
              e.target.value = "";
              setDocumentFile(null);
              return;
            }
            setDocumentFile(nextFile);
          }}
        />
        {documentFile ? <p style={styles.smallMuted}>{documentFile.name}</p> : null}
        {aiNote ? <p style={styles.smallMuted}>{aiNote}</p> : null}
        <button
          style={styles.primaryBtn}
          onClick={uploadInvestmentDocument}
          disabled={documentBusy || !documentFile}
        >
          {documentBusy ? "Extracting..." : "Upload And Extract"}
        </button>
      </Section>

      <Section styles={styles} title="Statement-Detected Broker Activity">
        {unlinkedSignals.length === 0 ? (
          <p style={styles.emptyText}>
            No unconfirmed broker activity right now.
          </p>
        ) : (
          unlinkedSignals.map((signal) => (
            <div key={signal.key} style={styles.signalCard}>
              <div style={styles.signalHeader}>
                <div>
                  <strong>{signal.label}</strong>
                  <p style={styles.transactionMeta}>
                    {formatInvestmentSignalMeta(signal)}
                  </p>
                </div>
                <strong>{formatInvestmentSignalNet(signal)}</strong>
              </div>
              <p style={styles.signalBody}>
                This is money flow found in statements, not the current value of the investment.
              </p>

              <div style={styles.inlineBtnRow}>
                <button
                  style={styles.secondaryInlineBtn}
                  onClick={() => fillFromSignal(signal)}
                >
                  Use In Form
                </button>
                <button
                  style={styles.primaryInlineBtn}
                  onClick={() => saveSignalAsInvestment(signal)}
                  disabled={saving || viewerMode}
                >
                  Save As Investment
                </button>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section styles={styles} title="Add Or Confirm Investment">
        <input
          style={styles.input}
          placeholder="Investment name, e.g. Vanguard ISA"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Platform"
          value={form.platform}
          onChange={(e) => setForm((prev) => ({ ...prev, platform: e.target.value }))}
        />
        <select
          style={styles.input}
          value={form.asset_type}
          onChange={(e) => setForm((prev) => ({ ...prev, asset_type: e.target.value }))}
        >
          <option value="general">General</option>
          <option value="isa">ISA</option>
          <option value="pension">Pension</option>
          <option value="crypto">Crypto</option>
          <option value="shares">Shares</option>
          <option value="funds">Funds</option>
        </select>
        <input
          style={styles.input}
          placeholder="Ticker symbol, e.g. VUAG.L or BTC"
          value={form.ticker_symbol}
          onChange={(e) => setForm((prev) => ({ ...prev, ticker_symbol: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Current value"
          type="text" inputMode="decimal"
          value={form.current_value}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, current_value: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Monthly contribution"
          type="text" inputMode="decimal"
          value={form.monthly_contribution}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, monthly_contribution: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Units owned"
          type="text" inputMode="decimal"
          value={form.units_owned}
          onChange={(e) => setForm((prev) => ({ ...prev, units_owned: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Total contributed"
          type="text" inputMode="decimal"
          value={form.total_contributed}
          onChange={(e) => setForm((prev) => ({ ...prev, total_contributed: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Cost basis"
          type="text" inputMode="decimal"
          value={form.cost_basis}
          onChange={(e) => setForm((prev) => ({ ...prev, cost_basis: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Risk level"
          value={form.risk_level}
          onChange={(e) => setForm((prev) => ({ ...prev, risk_level: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
        />

        <button style={styles.primaryBtn} onClick={() => saveInvestment()} disabled={saving || viewerMode}>
          {viewerMode ? "Viewer mode on" : saving ? "Saving..." : "Save Investment"}
        </button>
      </Section>

      <Section styles={styles} title="Saved Investments">
        {investments.length === 0 ? (
          <p style={styles.emptyText}>No investments saved yet.</p>
        ) : (
          investments.map((investment) => {
            const match = getInvestmentMatchSummary(investment, transactions);
            const status = getInvestmentMonthlyStatus(investment, transactions);
            const performance = getInvestmentPerformanceSummary(investment);
            return (
              <div key={investment.id} style={styles.signalCard}>
                <div style={styles.signalHeader}>
                  <div>
                    <strong>{investment.name}</strong>
                    <p style={styles.transactionMeta}>
                      {investment.platform || "No platform"} · {investment.asset_type || "general"} · source {investment.source || "manual"}
                    </p>
                  </div>
                  <strong>
                    {performance.marketValueLabel}
                  </strong>
                </div>
                <p style={styles.signalBody}>
                  Monthly contribution: {investment.monthly_contribution != null ? `£${Number(investment.monthly_contribution).toFixed(2)}` : "not set"}
                  {" · "}
                  Matched contributions: {match.count}
                  {" · "}
                  Last seen: {match.lastDate || "not found yet"}
                </p>
                <p style={styles.signalBody}>
                  Symbol: {investment.ticker_symbol || "not set"}
                  {" · "}
                  Gain/loss read: {performance.gainLossLabel}
                  {" · "}
                  Risk: {investment.risk_level || "not set"}
                </p>
                <div style={styles.inlineBtnRow}>
                  <span style={getStatusPillStyle(status.tone)}>{status.label}</span>
                  <button
                    style={styles.secondaryInlineBtn}
                    onClick={() => refreshPrice(investment)}
                    disabled={quoteBusyKey === investment.id}
                  >
                    {quoteBusyKey === investment.id ? "Refreshing..." : "Refresh Price"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </Section>

      {documents.length > 0 ? (
        <Section styles={styles} title="Recent Investment Documents">
          {documents.slice(0, 5).map((doc) => (
            <Row
              styles={styles}
              key={doc.id}
              name={doc.file_name || "Investment document"}
              value={doc.extraction_status || "uploaded"}
            />
          ))}
        </Section>
      ) : null}
    </>
  );
}


