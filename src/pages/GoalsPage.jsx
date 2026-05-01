import { useState } from "react";
import { supabase } from "../supabase";
import {
  ActionCard as BaseActionCard,
  InsightCard as BaseInsightCard,
  Row as BaseRow,
  Section as BaseSection,
} from "../components/ui";
import { buildGoalSuggestions } from "../lib/goalInsights";
import { getMeaningfulCategory } from "../lib/finance";

const PERIOD_OPTIONS = [
  { label: "3m", months: 3 },
  { label: "6m", months: 6 },
  { label: "12m", months: 12 },
];

const VIEW_OPTIONS = [
  { key: "monthly", label: "Monthly", multiplier: 1 },
  { key: "quarterly", label: "Quarterly", multiplier: 3 },
  { key: "yearly", label: "Yearly", multiplier: 12 },
];

export default function GoalsPage({
  goals,
  accounts = [],
  transactions,
  onGoToCoach,
  onNavigate,
  onChange,
  onAccountsChange,
  styles,
  helpers,
}) {
  const {
    getDataFreshness,
    getSubscriptionSummary,
    isInternalTransferLike,
    formatCurrency,
    numberOrNull,
  } = helpers;
  const freshness = getDataFreshness(transactions);
  const subscriptionSummary = getSubscriptionSummary(transactions);
  const [saving, setSaving] = useState(false);
  const [periodMonths, setPeriodMonths] = useState(3);
  const [viewMode, setViewMode] = useState("monthly");
  const [savingAccountRole, setSavingAccountRole] = useState("");
  const [form, setForm] = useState({
    name: "",
    target_amount: "",
    current_amount: "",
    timeframe: "fast",
  });

  const latestDate = transactions
    .map((transaction) => new Date(transaction.transaction_date))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a)[0] || new Date();
  const timeframeStart = new Date(latestDate.getFullYear(), latestDate.getMonth() - (periodMonths - 1), 1);
  const periodAllTransactions = transactions.filter((transaction) => {
    const date = new Date(transaction.transaction_date);
    return !Number.isNaN(date.getTime()) && date >= timeframeStart && date <= latestDate;
  });
  const timeframeTransactions = periodAllTransactions.filter((transaction) => !isInternalTransferLike(transaction));
  const monthKeys = new Set(
    timeframeTransactions
      .map((transaction) => new Date(transaction.transaction_date))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => `${date.getFullYear()}-${date.getMonth()}`)
  );
  const monthCount = Math.max(monthKeys.size, 1);
  const timeframeLabel = `${timeframeStart.toLocaleDateString("en-GB", { month: "short" })} to ${latestDate.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`;
  const selectedView = VIEW_OPTIONS.find((option) => option.key === viewMode) || VIEW_OPTIONS[0];
  const viewLabel = selectedView.label.toLowerCase();

  const accountStats = accounts.map((account) => {
    const tx = periodAllTransactions.filter((transaction) => transaction.account_id === account.id);
    const incomingTransfers = tx.filter((transaction) => Number(transaction.amount) > 0 && isInternalTransferLike(transaction));
    const outgoingTransfers = tx.filter((transaction) => Number(transaction.amount) < 0 && isInternalTransferLike(transaction));
    const externalOut = tx.filter((transaction) => Number(transaction.amount) < 0 && !isInternalTransferLike(transaction));
    const accountDecision = account.counts_as_savings;
    const nameLooksSavings = /save|saver|saving|isa|pot|vault|reserve|emergency/i.test(`${account.name || ""} ${account.nickname || ""}`);
    const inferredSavings = nameLooksSavings && incomingTransfers.length >= outgoingTransfers.length && externalOut.length <= 2;
    const likelySavings = accountDecision === true || (accountDecision == null && inferredSavings);
    const netTransferIn = incomingTransfers.reduce((sum, item) => sum + Number(item.amount || 0), 0) - outgoingTransfers.reduce((sum, item) => sum + Math.abs(Number(item.amount || 0)), 0);
    return { account, likelySavings, nameLooksSavings, netTransferIn: Math.max(netTransferIn, 0) };
  });
  const suggestedSavingsAccounts = accountStats.filter((item) => item.nameLooksSavings && item.account.counts_as_savings == null);
  const confirmedSavingsIn = accountStats
    .filter((item) => item.likelySavings)
    .reduce((sum, item) => sum + item.netTransferIn, 0);

  const incomeTotal = timeframeTransactions
    .filter((transaction) => Number(transaction.amount) > 0)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const fixedBillsTotal = timeframeTransactions
    .filter((transaction) => Number(transaction.amount) < 0 && isBillLike(transaction))
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const flexibleSpendTotal = timeframeTransactions
    .filter((transaction) => Number(transaction.amount) < 0 && !isBillLike(transaction))
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const monthlyIncome = incomeTotal / monthCount;
  const monthlyFixedBills = fixedBillsTotal / monthCount;
  const monthlyFlexibleSpend = flexibleSpendTotal / monthCount;
  const monthlyNetLeft = Math.max(monthlyIncome - monthlyFixedBills - monthlyFlexibleSpend, 0);
  const monthlyConfirmedSavings = confirmedSavingsIn / monthCount;

  const categoryTotals = timeframeTransactions
    .filter((transaction) => Number(transaction.amount) < 0 && !isBillLike(transaction))
    .reduce((groups, transaction) => {
      const category = getMeaningfulCategory(transaction) || "Spending";
      groups[category] = (groups[category] || 0) + Math.abs(Number(transaction.amount || 0));
      return groups;
    }, {});
  const behaviourInsights = Object.entries(categoryTotals)
    .map(([category, total]) => ({
      category,
      total,
      monthlyAverage: total / monthCount,
    }))
    .filter((item) => !["Income", "Internal Transfer", "Uncategorised", "Spending", "Bill"].includes(item.category))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
  const topBehaviourSave = behaviourInsights[0] ? behaviourInsights[0].monthlyAverage * 0.25 : 0;
  const likelyMonthlySaving = Math.max(monthlyConfirmedSavings, monthlyNetLeft) + topBehaviourSave;

  const mainGoal =
    goals.find((goal) => String(goal.name || "").toLowerCase().includes("house")) ||
    goals[0] ||
    null;
  const hasSavedGoal = Boolean(mainGoal);
  const target = Number(mainGoal?.target_amount || form.target_amount || 0);
  const current = Number(mainGoal?.current_amount || form.current_amount || 0);
  const gap = Math.max(target - current, 0);
  const percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const fastestMonths = gap > 0 && likelyMonthlySaving > 0 ? Math.ceil(gap / likelyMonthlySaving) : null;
  const monthlyBillsForSuggestions = monthlyFixedBills;
  const suggestions = buildGoalSuggestions({
    hasData: freshness.hasData,
    monthlyBills: monthlyBillsForSuggestions,
    behaviourInsights: behaviourInsights.map((item) => ({
      ...item,
      threeMonthTotal: item.monthlyAverage * 3,
      amountLabel: formatCurrency(item.monthlyAverage * 3),
    })),
    timeframeLabel,
    latestMonthName: timeframeLabel,
    subscriptionCount: subscriptionSummary.count,
  });
  const primarySuggestion = suggestions[0];

  function displayAmount(monthlyAmount) {
    return formatCurrency(monthlyAmount * selectedView.multiplier);
  }

  function fillGoalForm(suggestion) {
    setForm({
      name: suggestion.name,
      target_amount: String(suggestion.target),
      current_amount: suggestion.current ? String(suggestion.current.toFixed(2)) : "",
      timeframe: "fast",
    });
  }

  async function confirmSavingsAccount(accountId, value) {
    setSavingAccountRole(accountId);
    try {
      const { error } = await supabase
        .from("accounts")
        .update({
          counts_as_savings: value,
          account_role: value ? "savings" : "not_savings",
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountId);

      if (error) throw error;
      await onAccountsChange?.();
    } catch {
      alert("Could not save that account choice yet.");
    } finally {
      setSavingAccountRole("");
    }
  }

  async function saveGoal(extra = {}) {
    const name = String(extra.name ?? form.name).trim();
    const targetAmount = numberOrNull(extra.target ?? form.target_amount);
    const currentAmount = numberOrNull(extra.current ?? form.current_amount) || 0;

    if (!name || !targetAmount) {
      alert("Add a goal name and target first.");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("money_goals").insert({
        user_id: user.id,
        name,
        target_amount: targetAmount,
        current_amount: currentAmount,
        priority: goals.length + 1,
      });

      if (error) throw error;

      setForm({ name: "", target_amount: "", current_amount: "", timeframe: "fast" });
      await onChange();
      alert("Goal saved.");
    } catch (error) {
      alert(error.message || "Could not save goal.");
    } finally {
      setSaving(false);
    }
  }

  const planPrompt = `Build my smartest goal plan. Target ${formatCurrency(target)}, current ${formatCurrency(current)}, gap ${formatCurrency(gap)}. Use ${timeframeLabel}. Monthly averages: income ${formatCurrency(monthlyIncome)}, fixed bills ${formatCurrency(monthlyFixedBills)}, flexible spend ${formatCurrency(monthlyFlexibleSpend)}, confirmed savings transfers ${formatCurrency(monthlyConfirmedSavings)}. Protect rent, bills, debts and essentials first.`;

  return (
    <>
      <BaseSection
        styles={styles}
        title={hasSavedGoal ? mainGoal.name || "Saved Goal" : "Goal Planner"}
        right={
          <button style={styles.ghostBtn} type="button" onClick={() => onNavigate("upload")}>
            Upload data
          </button>
        }
      >
        {hasSavedGoal ? (
          <>
            <p style={styles.goalStat}>{formatCurrency(current)} / {formatCurrency(target)}</p>
            <div style={styles.progressOuter}>
              <div style={{ ...styles.progressInner, width: `${percent}%` }} />
            </div>
            <div style={styles.inlineInfoBlock}>
              <BaseRow styles={styles} name="Left to go" value={formatCurrency(gap)} />
              <BaseRow styles={styles} name="Fastest realistic estimate" value={fastestMonths ? `${fastestMonths} month${fastestMonths === 1 ? "" : "s"}` : "Needs cleaner data"} />
            </div>
          </>
        ) : (
          <>
            <p style={styles.sectionIntro}>
              Pick a target, or use Money Hub's best first suggestion. The plan below updates from your real statement patterns.
            </p>
            {primarySuggestion ? (
              <BaseInsightCard
                styles={styles}
                label="Best first goal"
                headline={`${primarySuggestion.name} · ${formatCurrency(primarySuggestion.target)}`}
                body={primarySuggestion.body}
                ctaLabel="Use this"
                onClick={() => fillGoalForm(primarySuggestion)}
              />
            ) : null}
            <input
              style={styles.input}
              placeholder="Goal name, e.g. Emergency buffer"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <input
              style={styles.input}
              placeholder="Target amount"
              inputMode="decimal"
              value={form.target_amount}
              onChange={(event) => setForm((prev) => ({ ...prev, target_amount: event.target.value }))}
            />
            <input
              style={styles.input}
              placeholder="Current amount, optional"
              inputMode="decimal"
              value={form.current_amount}
              onChange={(event) => setForm((prev) => ({ ...prev, current_amount: event.target.value }))}
            />
            <select
              style={styles.input}
              value={form.timeframe}
              onChange={(event) => setForm((prev) => ({ ...prev, timeframe: event.target.value }))}
            >
              <option value="fast">As fast as realistically possible</option>
              <option value="6m">Within 6 months</option>
              <option value="12m">Within 12 months</option>
              <option value="24m">Within 24 months</option>
            </select>
            <button style={styles.primaryBtn} type="button" onClick={() => saveGoal()} disabled={saving}>
              {saving ? "Saving..." : "Save Goal"}
            </button>
          </>
        )}
      </BaseSection>

      <BaseSection styles={styles} title="Smart Plan">
        <p style={styles.sectionIntro}>
          Based on {monthCount} month{monthCount === 1 ? "" : "s"} of clean data from {timeframeLabel}. Transfers are ignored unless they land in a confirmed savings-style account.
        </p>
        <div style={styles.inlineBtnRow}>
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.months}
              style={periodMonths === option.months ? styles.primaryInlineBtn : styles.secondaryInlineBtn}
              type="button"
              onClick={() => setPeriodMonths(option.months)}
            >
              {option.label}
            </button>
          ))}
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.key}
              style={viewMode === option.key ? styles.primaryInlineBtn : styles.secondaryInlineBtn}
              type="button"
              onClick={() => setViewMode(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div style={styles.inlineInfoBlock}>
          <BaseRow styles={styles} name={`${selectedView.label} income`} value={displayAmount(monthlyIncome)} />
          <BaseRow styles={styles} name={`${selectedView.label} fixed bills`} value={displayAmount(monthlyFixedBills)} />
          <BaseRow styles={styles} name={`${selectedView.label} flexible spending`} value={displayAmount(monthlyFlexibleSpend)} />
          <BaseRow styles={styles} name={`${selectedView.label} savings power`} value={likelyMonthlySaving > 0 ? displayAmount(likelyMonthlySaving) : "Not visible yet"} />
          <BaseRow styles={styles} name="Goal ETA" value={fastestMonths ? `${fastestMonths} month${fastestMonths === 1 ? "" : "s"}` : target > 0 ? "Needs more room" : "Add a target"} />
        </div>
        <button
          style={styles.primaryBtn}
          type="button"
          onClick={() => onGoToCoach(planPrompt, { autoSend: true })}
          disabled={target <= 0}
        >
          Ask AI for my smartest plan
        </button>
      </BaseSection>

      {suggestedSavingsAccounts.length > 0 ? (
        <BaseSection styles={styles} title="Savings Account Check">
          <p style={styles.sectionIntro}>
            Confirm once and transfers that land there will count as savings progress.
          </p>
          {suggestedSavingsAccounts.map(({ account }) => (
            <div key={account.id} style={styles.signalCard}>
              <strong>{account.name}</strong>
              <p style={styles.transactionMeta}>Should money moved into this account count as savings?</p>
              <div style={styles.inlineBtnRow}>
                <button style={styles.secondaryInlineBtn} type="button" onClick={() => confirmSavingsAccount(account.id, true)} disabled={savingAccountRole === account.id}>Yes</button>
                <button style={styles.secondaryInlineBtn} type="button" onClick={() => confirmSavingsAccount(account.id, false)} disabled={savingAccountRole === account.id}>No</button>
              </div>
            </div>
          ))}
        </BaseSection>
      ) : null}

      <BaseSection styles={styles} title="Smart Moves">
        {behaviourInsights.length > 0 ? (
          <div style={styles.aiInsightGrid}>
            {behaviourInsights.map((item) => (
              <BaseActionCard
                key={item.category}
                styles={styles}
                label="Behaviour win"
                headline={`Trim ${item.category}`}
                body={`${viewLabel === "monthly" ? "Monthly average" : selectedView.label} ${item.category.toLowerCase()} is ${displayAmount(item.monthlyAverage)}. Redirecting 25% would add ${displayAmount(item.monthlyAverage * 0.25)} to the goal.`}
                actionLabel="Build habit plan"
                onClick={() => onGoToCoach(`Create a practical habit plan from my ${item.category} spending. Monthly average is ${formatCurrency(item.monthlyAverage)} over ${timeframeLabel}.`, { autoSend: true })}
              />
            ))}
          </div>
        ) : (
          <BaseActionCard
            styles={styles}
            label="Data quality"
            headline="No clean flexible category yet"
            body="Once uploads and payment confirmations are cleaner, this will focus on the best habit to change first."
            actionLabel="Upload latest"
            onClick={() => onNavigate("upload")}
          />
        )}
      </BaseSection>

      {goals.length > 1 ? (
        <BaseSection styles={styles} title="Saved Goals">
          {goals.map((goal) => {
            const savedTarget = Number(goal.target_amount || 0);
            const savedCurrent = Number(goal.current_amount || 0);
            const savedPercent = savedTarget > 0 ? Math.min((savedCurrent / savedTarget) * 100, 100) : 0;
            return (
              <BaseRow
                styles={styles}
                key={goal.id || goal.name}
                name={goal.name || "Goal"}
                value={`${savedPercent.toFixed(0)}% of ${formatCurrency(savedTarget)}`}
              />
            );
          })}
        </BaseSection>
      ) : null}
    </>
  );
}

function isBillLike(transaction) {
  return Boolean(transaction._smart_is_bill || transaction.is_bill || transaction._smart_is_subscription || transaction.is_subscription);
}
