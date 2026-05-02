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
      if (paths.length) {
        await supabase.storage.from("receipts").remove(paths);
      }

      const tables = [
        "receipts",
        "financial_documents",
        "ai_messages",
        "money_understanding_snapshots",
        "transaction_rules",
        "debts",
        "investments",
        "money_goals",
        "transactions",
        "statement_imports",
        "accounts",
      ];

      for (const table of tables) {
        const { error } = await supabase.from(table).delete().eq("user_id", userId);
        if (error) throw error;
      }

      replayOnboarding(userId);
      await onDataChange?.();
      alert("Your Money Hub data was deleted. Setup will run again.");
    } catch (error) {
      alert(error.message || "Could not delete all data.");
    } finally {
      setResetBusy(false);
    }
  }

  async function deleteSelectedMonths() {
    if (!selectedMonths.length) return;
    const confirmed = window.confirm(`Delete transactions for ${selectedMonths.length} selected month${selectedMonths.length === 1 ? "" : "s"}? This also clears AI money snapshots so the app can rebuild its read.`);
    if (!confirmed) return;

    setMonthDeleteBusy(true);
    try {
      for (const month of selectedMonths) {
        const { startDate, endDate } = getMonthBounds(month);
        const { error: txError } = await supabase
          .from("transactions")
          .delete()
          .eq("user_id", userId)
          .gte("transaction_date", startDate)
          .lte("transaction_date", endDate);
        if (txError) throw txError;

        const { error: importError } = await supabase
          .from("statement_imports")
          .delete()
          .eq("user_id", userId)
          .lte("start_date", endDate)
          .gte("end_date", startDate);
        if (importError) throw importError;
      }

      await supabase.from("money_understanding_snapshots").delete().eq("user_id", userId);
      setSelectedMonths([]);
      await onDataChange?.();
      alert("Selected month data deleted.");
    } catch (error) {
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
      <Section title="Plan And Premium" styles={styles}>
        <p style={styles.sectionIntro}>{getPremiumFeatureSummary(subscriptionStatus).body}</p>
        <Row name="Current plan" value={subscriptionStatus?.label || "Free"} styles={styles} />
        <Row name="Paid hook" value="Automatic bank sync and smarter warnings" styles={styles} />
        <Row name="Payment path" value="Stripe subscription table ready" styles={styles} />
        <div style={styles.compactInsightGrid}>
          <FeatureList title="Free" features={FREE_FEATURES} styles={styles} />
          <FeatureList title="Premium" features={PREMIUM_FEATURES} styles={styles} />
        </div>
      </Section>

      <Section title="Live Bank Feed Prep" styles={styles}>
        <p style={styles.sectionIntro}>{bankFeedReadiness.body}</p>
        <Row name="Recommended provider" value={BANK_FEED_PROVIDER.name} styles={styles} />
        <Row name="Why this first" value="Lowest-cost UK AIS path" styles={styles} />
        <Row name="Connected banks" value={`${bankConnections.length}`} styles={styles} />
        <Row name="Active feeds" value={`${bankFeedReadiness.activeCount || 0}`} styles={styles} />
        <Row name="Fallbacks" value={BANK_FEED_PROVIDER.fallbackProviders.join(", ")} styles={styles} />
        <button style={styles.primaryBtn} type="button" disabled>
          Bank connection coming in Premium
        </button>
      </Section>

      <Section title="Family / Viewer Mode" styles={styles}>
        <p style={styles.sectionIntro}>
          Shared viewer mode is now wired in as a read-only access layer.
          Use it for parents, partner, or anyone who should see progress without editing anything.
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

      <Section title="Current Viewer Access" styles={styles}>
        {viewerAccess.length === 0 ? (
          <p style={styles.emptyText}>No viewers added yet.</p>
        ) : (
          viewerAccess.map((item) => (
            <Row
              key={item.id}
              name={`${item.label || item.viewer_email} (${item.role || "viewer"})`}
              value={item.invite_status || "pending"}
              styles={styles}
            />
          ))
        )}
      </Section>

      <Section title="Documents And Extraction" styles={styles}>
        <Row name="Saved finance documents" value={`${financialDocuments.length}`} styles={styles} />
        <Row name="Image extraction" value="Live" styles={styles} />
        <Row name="PDF storage" value="Live" styles={styles} />
      </Section>

      <Section title="Help And Tips" styles={styles}>
        <p style={styles.sectionIntro}>
          Run setup again if you want the guided flow: upload statements, check Calendar, set a goal, then ask AI.
        </p>
        <Row name="Best first upload" value="Any CSV statements. Multiple files are fine." styles={styles} />
        <Row name="Main check" value="Calendar finds bills, rent, subscriptions and debt payments." styles={styles} />
        <Row name="Final step" value="Ask AI for a simple money overview." styles={styles} />
        <button style={styles.ghostBtn} type="button" onClick={() => replayOnboarding(userId)}>
          Replay guided setup
        </button>
        <button style={styles.ghostBtn} type="button" onClick={onShowPrivacy}>
          Privacy
        </button>
      </Section>

      <Section title="Reset Or Delete Data" styles={styles}>
        <p style={styles.sectionIntro}>
          Use this if an upload went wrong or you want to start again. Money Hub keeps this manual and obvious on purpose.
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

      <Section title="Product Direction" styles={styles}>
        <Row name="Statement-first setup" value="Core" styles={styles} />
        <Row name="Bulk multi-statement upload" value="Live" styles={styles} />
        <Row name="Recurring payment inference" value="Live" styles={styles} />
        <Row name="Debt/investment smart tracking" value="Premium" styles={styles} />
        <Row name="Live market pricing" value="Premium" styles={styles} />
        <Row name="Viewer mode" value="Premium" styles={styles} />
        <Row name="Live bank feeds" value="Premium prep" styles={styles} />
      </Section>
    </>
  );
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
