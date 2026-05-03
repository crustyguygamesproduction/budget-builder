import { useState } from "react";
import { supabase } from "../supabase";
import { Row, Section } from "../components/ui";
import { replayOnboarding } from "../components/onboarding/onboardingState";
import { BANK_FEED_PROVIDER } from "../lib/bankFeeds";
import { FREE_FEATURES, PREMIUM_FEATURES, getPremiumFeatureSummary } from "../lib/productPlan";

export default function SettingsPage({
  userId,
  transactions = [],
  viewerAccess,
  onViewerChange,
  onDataChange,
  viewerMode,
  setViewerMode,
  financialDocuments,
  subscriptionStatus,
  bankFeedReadiness,
  bankConnections,
  onShowPrivacy,
  styles,
}) {
  const [viewerEmail, setViewerEmail] = useState("");
  const [viewerLabel, setViewerLabel] = useState("");
  const [sharing, setSharing] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [monthDeleteBusy, setMonthDeleteBusy] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const monthOptions = getMonthOptions(transactions);

  async function addViewer() {
    if (!viewerEmail.trim()) return;

    setSharing(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("viewer_access").insert({
        user_id: user.id,
        viewer_email: viewerEmail.trim().toLowerCase(),
        label: viewerLabel.trim() || null,
        role: "viewer",
        invite_status: "pending",
      });

      if (error) throw error;

      setViewerEmail("");
      setViewerLabel("");
      await onViewerChange();
      alert("Viewer added. Once the other person has an account, this can become a proper shared read-only view.");
    } catch (error) {
      alert(error.message || "Could not add viewer yet.");
    } finally {
      setSharing(false);
    }
  }

  async function wipeAllData() {
    const first = window.confirm("This deletes your Money Hub data and restarts setup. It cannot be undone. Continue?");
    if (!first) return;
    const typed = window.prompt("Type DELETE to wipe statements, goals, receipts, AI chat, rules, debts and investments.");
    if (typed !== "DELETE") return;

    setResetBusy(true);
    const deletionCounts = {};
    const auditEventId = await createDeletionEvent({
      userId,
      actionType: "full_wipe",
      selectedMonths: [],
      counts: { requested: true },
      status: "started",
    });

    try {
      const { data: receipts } = await supabase
        .from("receipts")
        .select("file_path")
        .eq("user_id", userId)
        .not("file_path", "is", null);
      const { data: docs } = await supabase
        .from("financial_documents")
        .select("file_path")
        .eq("user_id", userId)
        .not("file_path", "is", null);
      const paths = [...(receipts || []), ...(docs || [])]
        .map((item) => item.file_path)
        .filter(Boolean);
      deletionCounts.storage_paths_requested = paths.length;
      if (paths.length) {
        const { error: storageError } = await supabase.storage.from("receipts").remove(paths);
        if (storageError) throw storageError;
      }

      const tables = [
        "receipts",
        "financial_documents",
        "ai_messages",
        "money_understanding_snapshots",
        "coach_context_snapshots",
        "transaction_rules",
        "debts",
        "investments",
        "money_goals",
        "transactions",
        "statement_imports",
        "accounts",
      ];

      for (const table of tables) {
        const { count, error } = await supabase
          .from(table)
          .delete({ count: "exact" })
          .eq("user_id", userId);
        if (error) throw error;
        deletionCounts[table] = count || 0;
      }

      await finishDeletionEvent({
        eventId: auditEventId,
        userId,
        actionType: "full_wipe",
        selectedMonths: [],
        counts: deletionCounts,
        status: "completed",
      });

      replayOnboarding(userId);
      await onDataChange?.();
      alert("Your Money Hub data was deleted. Setup will run again.");
    } catch (error) {
      await finishDeletionEvent({
        eventId: auditEventId,
        userId,
        actionType: "full_wipe",
        selectedMonths: [],
        counts: deletionCounts,
        status: "failed",
        errorCode: getDeletionErrorCode(error),
      });
      alert(error.message || "Could not delete all data.");
    } finally {
      setResetBusy(false);
    }
  }

  async function deleteSelectedMonths() {
    if (!selectedMonths.length) return;
    const confirmed = window.confirm(`Delete ${selectedMonths.length} selected month${selectedMonths.length === 1 ? "" : "s"} of uploaded bank history? Money Hub will rebuild its read afterwards.`);
    if (!confirmed) return;

    setMonthDeleteBusy(true);
    const monthsToDelete = [...selectedMonths];
    const deletionCounts = {
      months_requested: monthsToDelete.length,
      transactions: 0,
      statement_imports: 0,
      money_understanding_snapshots: 0,
      coach_context_snapshots: 0,
    };
    const auditEventId = await createDeletionEvent({
      userId,
      actionType: "month_delete",
      selectedMonths: monthsToDelete,
      counts: { months_requested: monthsToDelete.length },
      status: "started",
    });

    try {
      for (const month of monthsToDelete) {
        const { startDate, endDate } = getMonthBounds(month);
        const { count: txCount, error: txError } = await supabase
          .from("transactions")
          .delete({ count: "exact" })
          .eq("user_id", userId)
          .gte("transaction_date", startDate)
          .lte("transaction_date", endDate);
        if (txError) throw txError;
        deletionCounts.transactions += txCount || 0;

        const { count: importCount, error: importError } = await supabase
          .from("statement_imports")
          .delete({ count: "exact" })
          .eq("user_id", userId)
          .lte("start_date", endDate)
          .gte("end_date", startDate);
        if (importError) throw importError;
        deletionCounts.statement_imports += importCount || 0;
      }

      const { count: snapshotCount, error: snapshotError } = await supabase
        .from("money_understanding_snapshots")
        .delete({ count: "exact" })
        .eq("user_id", userId);
      if (snapshotError) throw snapshotError;
      deletionCounts.money_understanding_snapshots = snapshotCount || 0;

      const { count: coachSnapshotCount, error: coachSnapshotError } = await supabase
        .from("coach_context_snapshots")
        .delete({ count: "exact" })
        .eq("user_id", userId);
      if (coachSnapshotError) throw coachSnapshotError;
      deletionCounts.coach_context_snapshots = coachSnapshotCount || 0;

      await finishDeletionEvent({
        eventId: auditEventId,
        userId,
        actionType: "month_delete",
        selectedMonths: monthsToDelete,
        counts: deletionCounts,
        status: "completed",
      });

      setSelectedMonths([]);
      await onDataChange?.();
      alert("Selected month data deleted.");
    } catch (error) {
      await finishDeletionEvent({
        eventId: auditEventId,
        userId,
        actionType: "month_delete",
        selectedMonths: monthsToDelete,
        counts: deletionCounts,
        status: "failed",
        errorCode: getDeletionErrorCode(error),
      });
      alert(error.message || "Could not delete those months.");
    } finally {
      setMonthDeleteBusy(false);
    }
  }

  function toggleMonth(month) {
    setSelectedMonths((current) =>
      current.includes(month) ? current.filter((item) => item !== month) : [...current, month]
    );
  }

  return (
    <>
      <Section title="Setup Guide" styles={styles}>
        <p style={styles.sectionIntro}>
          Use this if you want Money Hub to walk you through the simple rhythm again: upload statements, review Calendar, set one goal, then ask AI.
        </p>
        <Row name="Best first upload" value="CSV bank statements. Multiple files are fine." styles={styles} />
        <Row name="Main review" value="Calendar finds bills, rent, subscriptions and debt payments." styles={styles} />
        <Row name="Then" value="Goals picks a safety target, AI explains the plan." styles={styles} />
        <button style={styles.ghostBtn} type="button" onClick={() => replayOnboarding(userId)}>
          Replay guided setup
        </button>
        <button style={styles.ghostBtn} type="button" onClick={onShowPrivacy}>
          Privacy
        </button>
      </Section>

      <Section title="Your Data" styles={styles}>
        <p style={styles.sectionIntro}>
          Use this if an upload went wrong or you want to start again. Deleting data is deliberately manual so it cannot happen by accident.
        </p>
        {monthOptions.length > 0 ? (
          <>
            <p style={styles.transactionMeta}>Delete selected months</p>
            <div style={getMonthGridStyle()}>
              {monthOptions.map((month) => (
                <label key={month.key} style={getMonthOptionStyle(selectedMonths.includes(month.key))}>
                  <input
                    type="checkbox"
                    checked={selectedMonths.includes(month.key)}
                    onChange={() => toggleMonth(month.key)}
                  />
                  <span>{month.label}</span>
                  <small>{month.count} transaction{month.count === 1 ? "" : "s"}</small>
                </label>
              ))}
            </div>
            <button
              style={styles.secondaryBtn}
              type="button"
              onClick={deleteSelectedMonths}
              disabled={monthDeleteBusy || selectedMonths.length === 0}
            >
              {monthDeleteBusy ? "Deleting..." : "Delete selected months"}
            </button>
          </>
        ) : (
          <p style={styles.emptyText}>No uploaded months to delete yet.</p>
        )}
        <button style={styles.ghostBtn} type="button" onClick={wipeAllData} disabled={resetBusy}>
          {resetBusy ? "Deleting..." : "Delete all data and restart setup"}
        </button>
      </Section>

      <Section title="Plan" styles={styles}>
        <p style={styles.sectionIntro}>{getPremiumFeatureSummary(subscriptionStatus).body}</p>
        <Row name="Current plan" value={subscriptionStatus?.label || "Free"} styles={styles} />
        <Row name="Today" value="Upload CSV statements whenever you want a fresh read." styles={styles} />
        <Row name="Later" value="Premium will add automatic bank sync." styles={styles} />
        <Row name="Connected banks" value={`${bankConnections.length}`} styles={styles} />
        {BANK_FEED_PROVIDER?.name ? (
          <Row name="Bank sync prep" value={bankFeedReadiness?.activeCount ? `${bankFeedReadiness.activeCount} active` : "Not connected yet"} styles={styles} />
        ) : null}
        <div style={styles.compactInsightGrid}>
          <FeatureList title="Free" features={FREE_FEATURES} styles={styles} />
          <FeatureList title="Premium" features={PREMIUM_FEATURES} styles={styles} />
        </div>
      </Section>

      <Section title="Privacy And Sharing" styles={styles}>
        <p style={styles.sectionIntro}>
          Add a read-only viewer if a partner, parent or helper should see progress without changing anything.
        </p>

        <label style={styles.checkRow}>
          <input
            type="checkbox"
            checked={viewerMode}
            onChange={(e) => setViewerMode(e.target.checked)}
          />
          <span>Preview the app in viewer mode</span>
        </label>

        <input
          style={styles.input}
          placeholder="Viewer email"
          value={viewerEmail}
          onChange={(e) => setViewerEmail(e.target.value)}
        />
        <input
          style={styles.input}
          placeholder="Label, e.g. Mum or Partner"
          value={viewerLabel}
          onChange={(e) => setViewerLabel(e.target.value)}
        />
        <button style={styles.primaryBtn} onClick={addViewer} disabled={sharing}>
          {sharing ? "Adding..." : "Add Viewer"}
        </button>
      </Section>

      <Section title="People Who Can View" styles={styles}>
        {viewerAccess.length === 0 ? (
          <p style={styles.emptyText}>No viewers added yet.</p>
        ) : (
          viewerAccess.map((item) => (
            <Row
              key={item.id}
              name={item.label || item.viewer_email}
              value={item.invite_status || "pending"}
              styles={styles}
            />
          ))
        )}
      </Section>

      <Section title="Receipts And Documents" styles={styles}>
        <p style={styles.sectionIntro}>
          Saved receipts and finance documents stay attached to your account so AI can use them when needed.
        </p>
        <Row name="Saved documents" value={`${financialDocuments.length}`} styles={styles} />
      </Section>
    </>
  );
}

async function createDeletionEvent({ userId, actionType, selectedMonths, counts, status }) {
  const payload = {
    user_id: userId,
    action_type: actionType,
    selected_months: selectedMonths,
    counts,
    status,
  };
  const { data, error } = await supabase
    .from("data_deletion_events")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (!error) return data?.id || null;
  if (!isAuditSchemaMissing(error)) {
    console.warn("Deletion audit event could not be started", error);
    return null;
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("data_deletion_events")
    .insert(stripNewAuditFields(payload))
    .select("id")
    .maybeSingle();

  if (fallbackError) {
    console.warn("Deletion audit event could not be started", fallbackError);
    return null;
  }

  return fallbackData?.id || null;
}

async function finishDeletionEvent({ eventId, userId, actionType, selectedMonths, counts, status, errorCode = null }) {
  const updatePayload = { counts, status, error_code: errorCode };

  if (eventId) {
    const { error } = await supabase
      .from("data_deletion_events")
      .update(updatePayload)
      .eq("id", eventId)
      .eq("user_id", userId);

    if (!error) return;
    if (!isAuditSchemaMissing(error)) console.warn("Deletion audit event could not be updated", error);

    const { error: fallbackUpdateError } = await supabase
      .from("data_deletion_events")
      .update({ counts })
      .eq("id", eventId)
      .eq("user_id", userId);

    if (!fallbackUpdateError) return;
    console.warn("Deletion audit event could not be updated", fallbackUpdateError);
  }

  const insertPayload = {
    user_id: userId,
    action_type: actionType,
    selected_months: selectedMonths,
    counts,
    status,
    error_code: errorCode,
  };
  const { error } = await supabase.from("data_deletion_events").insert(insertPayload);

  if (!error) return;
  if (!isAuditSchemaMissing(error)) {
    console.warn("Deletion audit event could not be saved", error);
    return;
  }

  const { error: fallbackInsertError } = await supabase
    .from("data_deletion_events")
    .insert(stripNewAuditFields(insertPayload));

  if (fallbackInsertError) {
    console.warn("Deletion audit event could not be saved", fallbackInsertError);
  }
}

function stripNewAuditFields(payload) {
  const legacyPayload = { ...payload };
  delete legacyPayload.status;
  delete legacyPayload.error_code;
  return legacyPayload;
}

function isAuditSchemaMissing(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST204" || message.includes("schema cache") || message.includes("status") || message.includes("error_code");
}

function getDeletionErrorCode(error) {
  return String(error?.code || error?.name || "delete_failed").slice(0, 64);
}

function getMonthOptions(transactions = []) {
  const groups = new Map();
  transactions.forEach((transaction) => {
    const value = transaction.transaction_date;
    if (!value) return;
    const key = String(value).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    if (!groups.has(key)) groups.set(key, 0);
    groups.set(key, groups.get(key) + 1);
  });

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, count]) => {
      const [year, month] = key.split("-").map(Number);
      const date = new Date(year, month - 1, 1);
      return {
        key,
        count,
        label: date.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      };
    });
}

function getMonthBounds(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function getMonthGridStyle() {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 8,
    margin: "10px 0",
  };
}

function getMonthOptionStyle(active) {
  return {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gap: "3px 8px",
    alignItems: "center",
    border: active ? "1px solid rgba(37, 99, 235, 0.4)" : "1px solid rgba(148, 163, 184, 0.24)",
    background: active ? "#eff6ff" : "#f8fafc",
    borderRadius: 14,
    padding: 10,
    fontWeight: 800,
  };
}

function FeatureList({ title, features, styles }) {
  return (
    <div style={styles.insightCard}>
      <p style={styles.insightLabel}>{title}</p>
      {features.map((feature) => (
        <Row key={feature} name={feature} value="Included" styles={styles} />
      ))}
    </div>
  );
}
