import { useState } from "react";
import { supabase } from "../supabase";
import {
  ActionCard as BaseActionCard,
  InsightCard as BaseInsightCard,
  Row as BaseRow,
  Section as BaseSection,
} from "../components/ui";
import { buildGoalSuggestions } from "../lib/goalInsights";

export default function GoalsPage({ goals, transactions, onGoToCoach, onNavigate, onChange, styles, helpers }) {
  const {
    getDataFreshness,
    getDisplayedMonthSnapshot,
    getSubscriptionSummary,
    isInternalTransferLike,
    isTransactionInMonth,
    formatCurrency,
    numberOrNull,
  } = helpers;
  const freshness = getDataFreshness(transactions);
  const latestMonth = getDisplayedMonthSnapshot(transactions);
  const subscriptionSummary = getSubscriptionSummary(transactions);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    target_amount: "",
    current_amount: "",
  });

  const transferSavings = transactions
    .filter((t) => isInternalTransferLike(t) && Number(t.amount) < 0)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
  const latestMonthBills = transactions
    .filter(
      (transaction) =>
        isTransactionInMonth(transaction, latestMonth.monthDate || new Date()) &&
        (transaction.is_bill || transaction.is_subscription)
    )
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);

  const mainGoal =
    goals.find((goal) => String(goal.name || "").toLowerCase().includes("house")) ||
    goals[0] ||
    null;
  const hasSavedGoal = Boolean(mainGoal);
  const suggestions = buildGoalSuggestions({
    hasData: freshness.hasData,
    monthlyBills: latestMonthBills,
    transferSavings,
    latestMonthName: latestMonth.monthName,
    subscriptionCount: subscriptionSummary.count,
  });
  const primarySuggestion = suggestions[0];

  const target = Number(mainGoal?.target_amount || 0);
  const current = Number(mainGoal?.current_amount || 0);
  const percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const gap = Math.max(target - current, 0);
  const nextMilestone = gap > 0
    ? Math.min(target, current + Math.max(250, Math.ceil(gap / 4 / 50) * 50))
    : target;

  function fillGoalForm(suggestion) {
    setForm({
      name: suggestion.name,
      target_amount: String(suggestion.target),
      current_amount: suggestion.current ? String(suggestion.current.toFixed(2)) : "",
    });
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

      setForm({ name: "", target_amount: "", current_amount: "" });
      await onChange();
      alert("Goal saved.");
    } catch (error) {
      alert(error.message || "Could not save goal.");
    } finally {
      setSaving(false);
    }
  }

  const goalRead = hasSavedGoal
    ? {
        headline: gap > 0 ? `${formatCurrency(gap)} still to go` : "Target reached",
        body: gap > 0
          ? `Next sensible marker is ${formatCurrency(nextMilestone)}. This is based only on your saved goal values, not invented progress.`
          : "This saved goal is already at or above target, so the next move is setting a fresh target.",
      }
    : {
        headline: "No saved goal yet",
        body: freshness.hasData
          ? "The figures below are suggestions from your statement patterns, not goals you created."
          : "Upload a statement first and Money Hub can suggest goals from real spending instead of generic targets.",
      };

  return (
    <>
      {hasSavedGoal ? (
        <BaseSection styles={styles} title={mainGoal.name || "Saved Goal"}>
          <p style={styles.goalStat}>{formatCurrency(current)} / {formatCurrency(target)}</p>
          <div style={styles.progressOuter}>
            <div style={{ ...styles.progressInner, width: `${percent}%` }} />
          </div>
          <div style={styles.inlineInfoBlock}>
            <BaseRow styles={styles} name="Progress" value={`${percent.toFixed(0)}%`} />
            <BaseRow styles={styles} name="Left to go" value={formatCurrency(gap)} />
            <BaseRow styles={styles} name="Next milestone" value={formatCurrency(nextMilestone)} />
          </div>
        </BaseSection>
      ) : (
        <BaseSection styles={styles}
          title="No Saved Goal Yet"
          right={
            <button style={styles.ghostBtn} type="button" onClick={() => onNavigate("upload")}>
              Upload data
            </button>
          }
        >
          <p style={styles.emptyText}>
            No saved goal is on your account yet. The ideas below are estimates from visible money patterns,
            kept separate from goals you choose to save.
          </p>
          {primarySuggestion ? (
            <div style={styles.inlineInfoBlock}>
              <BaseRow styles={styles} name="Smart suggestion" value={primarySuggestion.name} />
              <BaseRow styles={styles} name="Suggested target" value={formatCurrency(primarySuggestion.target)} />
              <BaseRow
                styles={styles}
                name="Progress today"
                value={primarySuggestion.current > 0 ? formatCurrency(primarySuggestion.current) : "Not set yet"}
              />
            </div>
          ) : null}
          <p style={styles.transactionMeta}>
            Suggestions are planning prompts only. Money Hub will not treat an estimated amount as a saved goal until you choose to save it.
          </p>
        </BaseSection>
      )}

      <BaseSection styles={styles} title={hasSavedGoal ? "Goal Read" : "Smart Goal Ideas"}>
        <div style={styles.aiInsightGrid}>
          <BaseInsightCard styles={styles}
            label={hasSavedGoal ? "Saved goal" : "Suggestion"}
            headline={goalRead.headline}
            body={goalRead.body}
            ctaLabel={freshness.needsUpload ? "Upload statement" : "Ask AI for plan"}
            onClick={() =>
              freshness.needsUpload
                ? onNavigate("upload")
                : onGoToCoach(
                    hasSavedGoal
                      ? `Give me a sharp plan for my saved goal: ${mainGoal.name}, target ${formatCurrency(target)}, current ${formatCurrency(current)}.`
                      : "Look at my money data and recommend the best first goal. Be clear about which figures are estimates.",
                    { autoSend: true }
                  )
            }
          />
          {!hasSavedGoal && suggestions.slice(0, 2).map((suggestion) => (
            <BaseActionCard styles={styles}
              key={suggestion.key}
              label={suggestion.label}
              headline={suggestion.headline}
              body={suggestion.body}
              actionLabel="Use this"
              onClick={() => fillGoalForm(suggestion)}
            />
          ))}
        </div>
      </BaseSection>

      <BaseSection styles={styles} title={hasSavedGoal ? "Next Moves" : "Save A Goal"}>
        {!hasSavedGoal ? (
          <>
            <input
              style={styles.input}
              placeholder="Goal name, e.g. Emergency buffer"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <input
              style={styles.input}
              placeholder="Target amount"
              inputMode="decimal"
              value={form.target_amount}
              onChange={(e) => setForm((prev) => ({ ...prev, target_amount: e.target.value }))}
            />
            <input
              style={styles.input}
              placeholder="Current amount, optional"
              inputMode="decimal"
              value={form.current_amount}
              onChange={(e) => setForm((prev) => ({ ...prev, current_amount: e.target.value }))}
            />
            <button style={styles.primaryBtn} type="button" onClick={() => saveGoal()} disabled={saving}>
              {saving ? "Saving..." : "Save Goal"}
            </button>
          </>
        ) : (
          <div style={styles.aiInsightGrid}>
            <BaseActionCard styles={styles}
              label="AI plan"
              headline={`${mainGoal.name || "This goal"} needs a practical route`}
              body="Ask the coach to turn the target into monthly actions using the data already visible in the app."
              actionLabel="Ask AI"
              onClick={() =>
                onGoToCoach(
                  `Build me a practical plan for my goal: ${mainGoal.name}, target ${formatCurrency(target)}, current ${formatCurrency(current)}.`,
                  { autoSend: true }
                )
              }
            />
            <BaseActionCard styles={styles}
              label="Safety check"
              headline={latestMonthBills > 0 ? `${formatCurrency(latestMonthBills)} in visible bills` : "Bills need cleaner history"}
              body="Before chasing a target, check whether the monthly bills and recurring payments leave enough room."
              actionLabel={freshness.needsUpload ? "Upload latest" : "Ask AI"}
              onClick={() =>
                freshness.needsUpload
                  ? onNavigate("upload")
                  : onGoToCoach("Check whether my saved goal is realistic against my bills, subscriptions, debts, and spending patterns.", { autoSend: true })
              }
            />
          </div>
        )}
      </BaseSection>

      {!hasSavedGoal && suggestions.length > 0 ? (
        <BaseSection styles={styles} title="Other Smart Suggestions">
          {suggestions.map((suggestion) => (
            <div key={suggestion.key} style={styles.signalCard}>
              <div style={styles.signalHeader}>
                <div>
                  <strong>{suggestion.name}</strong>
                  <p style={styles.transactionMeta}>{suggestion.headline}</p>
                </div>
                <strong>{formatCurrency(suggestion.target)}</strong>
              </div>
              <p style={styles.signalBody}>{suggestion.body}</p>
              <div style={styles.inlineBtnRow}>
                <button style={styles.secondaryInlineBtn} type="button" onClick={() => fillGoalForm(suggestion)}>
                  Fill form
                </button>
                <button
                  style={styles.secondaryInlineBtn}
                  type="button"
                  onClick={() => onGoToCoach(suggestion.prompt, { autoSend: true })}
                >
                  Ask AI
                </button>
              </div>
            </div>
          ))}
        </BaseSection>
      ) : null}

      {goals.length > 1 ? (
        <BaseSection styles={styles} title="Saved Goals">
          {goals.map((goal) => {
            const savedTarget = Number(goal.target_amount || 0);
            const savedCurrent = Number(goal.current_amount || 0);
            const savedPercent = savedTarget > 0 ? Math.min((savedCurrent / savedTarget) * 100, 100) : 0;
            return (
              <BaseRow styles={styles}
                key={goal.id || goal.name}
                name={goal.name || "Goal"}
                value={`${savedPercent.toFixed(0)}% of ${formatCurrency(savedTarget)}`}
              />
            );
          })}
        </BaseSection>
      ) : null}

      <BaseSection styles={styles} title="What This Uses">
        <BaseRow styles={styles} name="Latest visible month" value={latestMonth.monthName} />
        <BaseRow styles={styles} name="Visible monthly bills" value={latestMonthBills > 0 ? formatCurrency(latestMonthBills) : "Not enough yet"} />
        <BaseRow styles={styles} name="Transfer-style saving" value={formatCurrency(transferSavings)} />
        <BaseRow styles={styles} name="Saved goals" value={`${goals.length}`} />
      </BaseSection>
    </>
  );
}
