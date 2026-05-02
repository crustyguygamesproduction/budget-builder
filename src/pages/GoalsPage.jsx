import { useMemo, useState } from "react";
import { supabase } from "../supabase";
import {
  ActionCard as BaseActionCard,
  InsightCard as BaseInsightCard,
  Row as BaseRow,
  Section as BaseSection,
} from "../components/ui";
import { buildGoalPlanFromMoneyModel } from "../lib/appMoneyModel";
import { isInternalTransferLike } from "../lib/finance";

export default function GoalsPage({
  goals,
  accounts = [],
  appMoneyModel,
  onGoToCoach,
  onNavigate,
  onChange,
  onAccountsChange,
  styles,
  helpers,
}) {
  const { formatCurrency, numberOrNull } = helpers;
  const [saving, setSaving] = useState(false);
  const [savingAccountRole, setSavingAccountRole] = useState("");
  const [activeGoalId, setActiveGoalId] = useState("");
  const [showGoalForm, setShowGoalForm] = useState(goals.length === 0);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [form, setForm] = useState({
    name: "",
    target_amount: "",
    current_amount: "",
    target_date: "",
  });

  const activeGoal =
    goals.find((goal) => goal.id === activeGoalId) ||
    goals.find((goal) => String(goal.name || "").toLowerCase().includes("emergency")) ||
    goals[0] ||
    null;
  const hasSavedGoal = Boolean(activeGoal);
  const draftGoal = activeGoal || {
    name: form.name || "Emergency buffer",
    target_amount: form.target_amount,
    current_amount: form.current_amount,
    target_date: form.target_date,
  };
  const plan = buildGoalPlanFromMoneyModel(draftGoal, appMoneyModel);
  const primarySuggestion = getPrimaryGoalSuggestion(appMoneyModel);
  const suggestedSavingsAccounts = useMemo(
    () => getSuggestedSavingsAccounts(accounts, appMoneyModel?.transactions || []),
    [accounts, appMoneyModel]
  );

  const planPrompt = [
    "Build my goal plan using Money Hub's shared money model.",
    `Goal: ${draftGoal.name || "Goal"}.`,
    `Target: ${formatCurrency(plan.target)}, saved: ${formatCurrency(plan.current)}, left: ${formatCurrency(plan.amountLeft)}.`,
    `Calendar bills: ${formatCurrency(appMoneyModel?.monthlyBillTotal || 0)} a month.`,
    `Clear income: ${appMoneyModel?.income?.label || "not clear"}.`,
    `Usual spending: ${appMoneyModel?.flexibleSpending?.label || "needs checking"}.`,
    `Safe saving amount: ${formatCurrency(appMoneyModel?.savingsCapacity?.safeMonthlyAmount || 0)}.`,
    "Keep it plain, honest, and do not treat historical net as current cash.",
  ].join(" ");

  function fillGoalForm(suggestion) {
    setForm({
      name: suggestion.name,
      target_amount: String(suggestion.target),
      current_amount: "",
      target_date: "",
    });
    setShowGoalForm(true);
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
    const targetDateValue = String((extra.target_date ?? form.target_date) || "").trim() || null;

    if (!name || !targetAmount) {
      alert("Add a goal name and target first.");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        user_id: user.id,
        name,
        target_amount: targetAmount,
        current_amount: currentAmount,
        priority: goals.length + 1,
      };
      if (targetDateValue) payload.target_date = targetDateValue;

      let { error } = await supabase.from("money_goals").insert(payload);
      if (error && targetDateValue && String(error.message || "").includes("target_date")) {
        delete payload.target_date;
        ({ error } = await supabase.from("money_goals").insert(payload));
      }

      if (error) throw error;

      setForm({ name: "", target_amount: "", current_amount: "", target_date: "" });
      setShowGoalForm(false);
      await onChange();
      alert("Goal saved.");
    } catch (error) {
      alert(error.message || "Could not save goal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <BaseSection
        styles={styles}
        title={hasSavedGoal ? activeGoal.name || "Goal" : "Goal Planner"}
        right={
          <button style={styles.ghostBtn} type="button" onClick={() => setShowGoalForm((value) => !value)}>
            {showGoalForm ? "Hide form" : "Add goal"}
          </button>
        }
      >
        {hasSavedGoal ? (
          <>
            {goals.length > 1 ? (
              <div style={styles.inlineBtnRow}>
                {goals.map((goal) => (
                  <button
                    key={goal.id || goal.name}
                    style={(activeGoal?.id || "") === goal.id ? styles.primaryInlineBtn : styles.secondaryInlineBtn}
                    type="button"
                    onClick={() => setActiveGoalId(goal.id)}
                  >
                    {goal.name || "Goal"}
                  </button>
                ))}
              </div>
            ) : null}

            <div style={styles.inlineInfoBlock}>
              <BaseRow styles={styles} name="Target" value={formatCurrency(plan.target)} />
              <BaseRow styles={styles} name="Saved" value={formatCurrency(plan.current)} />
              <BaseRow styles={styles} name="Left to go" value={formatCurrency(plan.amountLeft)} />
              <BaseRow styles={styles} name="Target date" value={activeGoal.target_date ? formatTargetDate(activeGoal.target_date) : "Not set"} />
            </div>

            <div style={styles.progressOuter}>
              <div style={{ ...styles.progressInner, width: `${plan.progressPercent}%` }} />
            </div>
            <div style={getStatusStyle(plan.status.tone)}>
              <strong>{plan.status.label}</strong>
              <span>{plan.status.body}</span>
            </div>
          </>
        ) : (
          <BaseInsightCard
            styles={styles}
            label="Best first goal"
            headline={`${primarySuggestion.name} - ${formatCurrency(primarySuggestion.target)}`}
            body={primarySuggestion.body}
            ctaLabel="Use this"
            onClick={() => fillGoalForm(primarySuggestion)}
          />
        )}

        {showGoalForm || !hasSavedGoal ? (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
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
            <input
              style={styles.input}
              type="date"
              value={form.target_date}
              onChange={(event) => setForm((prev) => ({ ...prev, target_date: event.target.value }))}
            />
            <button style={styles.primaryBtn} type="button" onClick={() => saveGoal()} disabled={saving}>
              {saving ? "Saving..." : "Save goal"}
            </button>
          </div>
        ) : null}
      </BaseSection>

      <BaseSection styles={styles} title="Smart Recommendation">
        <p style={styles.sectionIntro}>
          {appMoneyModel?.savingsCapacity?.body || "Money Hub needs a statement before it can recommend a safe amount."}
        </p>
        <div style={styles.inlineInfoBlock}>
          <BaseRow styles={styles} name="Safe amount" value={formatCurrency(appMoneyModel?.savingsCapacity?.safeMonthlyAmount || 0)} />
          <BaseRow styles={styles} name="Stretch amount" value={formatCurrency(appMoneyModel?.savingsCapacity?.stretchMonthlyAmount || 0)} />
          <BaseRow styles={styles} name="Pace needed" value={plan.targetMonths ? formatCurrency(plan.requiredMonthly) : "Set a target date"} />
          <BaseRow styles={styles} name="Goal ETA" value={plan.fastestMonths ? `${plan.fastestMonths} month${plan.fastestMonths === 1 ? "" : "s"}` : "Needs more room"} />
        </div>
      </BaseSection>

      <BaseSection styles={styles} title="Monthly Plan">
        <div style={styles.inlineInfoBlock}>
          <BaseRow styles={styles} name="Clear monthly income" value={appMoneyModel?.income?.label || "Income is not clear yet"} />
          <BaseRow styles={styles} name="Calendar bills" value={formatCurrency(appMoneyModel?.monthlyBillTotal || 0)} />
          <BaseRow styles={styles} name="Usual spending" value={appMoneyModel?.flexibleSpending?.label || "Needs checking"} />
          <BaseRow styles={styles} name="Data quality" value={getDataQualityLabel(appMoneyModel)} />
        </div>
      </BaseSection>

      <BaseSection styles={styles} title="What To Do Next">
        <div style={styles.inlineBtnRow}>
          {!activeGoal?.target_date && hasSavedGoal ? (
            <button style={styles.secondaryInlineBtn} type="button" onClick={() => setShowGoalForm(true)}>
              Set target date
            </button>
          ) : null}
          <button style={styles.primaryInlineBtn} type="button" onClick={() => onGoToCoach(planPrompt, { autoSend: true })}>
            Ask AI for a plan
          </button>
          {(appMoneyModel?.nextBestActions || []).map((action) => (
            <button
              key={action.key}
              style={styles.secondaryInlineBtn}
              type="button"
              onClick={() => onNavigate(action.target)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </BaseSection>

      <BaseSection
        styles={styles}
        title="What Money Hub Is Using"
        right={
          <button style={styles.ghostBtn} type="button" onClick={() => setShowAssumptions((value) => !value)}>
            {showAssumptions ? "Hide" : "Show"}
          </button>
        }
      >
        {showAssumptions ? (
          <div style={styles.inlineInfoBlock}>
            <BaseRow styles={styles} name="Bank history" value={appMoneyModel?.period?.label || "No history yet"} />
            <BaseRow styles={styles} name="Bills from Calendar" value={`${appMoneyModel?.billStreams?.length || 0}`} />
            <BaseRow styles={styles} name="Income read" value={plainConfidence(appMoneyModel?.income?.confidence)} />
            <BaseRow styles={styles} name="Spending read" value={plainConfidence(appMoneyModel?.flexibleSpending?.confidence)} />
            <BaseRow styles={styles} name="Checks waiting" value={`${appMoneyModel?.checksWaiting?.length || 0}`} />
            {(appMoneyModel?.confidenceWarnings || []).slice(0, 3).map((warning) => (
              <BaseRow key={warning} styles={styles} name="Needs checking" value={warning} />
            ))}
          </div>
        ) : (
          <p style={styles.sectionIntro}>Calendar bills, interpreted transactions, Checks answers, and recent statement history.</p>
        )}
      </BaseSection>

      {suggestedSavingsAccounts.length > 0 ? (
        <BaseSection styles={styles} title="Savings Account Check">
          <p style={styles.sectionIntro}>Confirm once and transfers into that account can be treated as savings progress.</p>
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
        {(appMoneyModel?.flexibleSpending?.topCategories || []).length > 0 ? (
          <div style={styles.aiInsightGrid}>
            {appMoneyModel.flexibleSpending.topCategories.slice(0, 3).map((item) => (
              <BaseActionCard
                key={item.category}
                styles={styles}
                label="Spending"
                headline={`Trim ${item.category}`}
                body={`Recent ${item.category.toLowerCase()} spending is ${formatCurrency(item.total)} in the planning window. Cutting a small part of it can support the goal without guessing.`}
                actionLabel="Build habit plan"
                onClick={() => onGoToCoach(`Create a practical habit plan from my ${item.category} spending. Use my shared Money Hub goal model and keep bills protected.`, { autoSend: true })}
              />
            ))}
          </div>
        ) : (
          <BaseActionCard
            styles={styles}
            label="Data quality"
            headline="No clear spending pattern yet"
            body="Add more statement history or answer Checks so this can point to one useful habit."
            actionLabel="Upload latest"
            onClick={() => onNavigate("upload")}
          />
        )}
      </BaseSection>

      {goals.length > 0 ? (
        <BaseSection styles={styles} title="Saved Goals">
          {goals.map((goal) => {
            const savedPlan = buildGoalPlanFromMoneyModel(goal, appMoneyModel);
            return (
              <button
                type="button"
                key={goal.id || goal.name}
                style={styles.actionCard}
                onClick={() => {
                  setActiveGoalId(goal.id);
                  setShowGoalForm(false);
                }}
              >
                <p style={styles.insightLabel}>{goal.target_date ? formatTargetDate(goal.target_date) : savedPlan.status.label}</p>
                <h4 style={styles.insightHeadline}>{goal.name || "Goal"}</h4>
                <p style={styles.insightBody}>{savedPlan.progressPercent.toFixed(0)}% of {formatCurrency(savedPlan.target)}</p>
                <span style={styles.insightCta}>Plan this goal</span>
              </button>
            );
          })}
        </BaseSection>
      ) : null}
    </>
  );
}

function getPrimaryGoalSuggestion(appMoneyModel) {
  const monthlyBills = Number(appMoneyModel?.monthlyBillTotal || 0);
  const monthlySpending = Number(appMoneyModel?.flexibleSpending?.monthlyEstimate || 0);
  const target = Math.max(500, Math.ceil((monthlyBills + monthlySpending) / 50) * 50);
  return {
    name: "Emergency buffer",
    target,
    body: "A small buffer comes first because it stops bills, overdrafts and surprises from knocking the whole plan over.",
  };
}

function getSuggestedSavingsAccounts(accounts, transactions) {
  return accounts
    .map((account) => {
      const accountTransactions = transactions.filter((transaction) => transaction.account_id === account.id);
      const incomingTransfers = accountTransactions.filter((transaction) => Number(transaction.amount) > 0 && isInternalTransferLike(transaction));
      const outgoingTransfers = accountTransactions.filter((transaction) => Number(transaction.amount) < 0 && isInternalTransferLike(transaction));
      const externalOut = accountTransactions.filter((transaction) => Number(transaction.amount) < 0 && !isInternalTransferLike(transaction));
      const nameLooksSavings = /save|saver|saving|isa|pot|vault|reserve|emergency/i.test(`${account.name || ""} ${account.nickname || ""}`);
      const likelySavings = nameLooksSavings && incomingTransfers.length >= outgoingTransfers.length && externalOut.length <= 2;
      return { account, nameLooksSavings, likelySavings };
    })
    .filter((item) => item.nameLooksSavings && item.account.counts_as_savings == null);
}

function getDataQualityLabel(appMoneyModel) {
  if (!appMoneyModel?.dataFreshness?.hasData) return "Needs statements";
  if (appMoneyModel?.checksWaiting?.length > 0) return "Needs Checks";
  if (appMoneyModel?.income?.confidence === "low") return "Income unclear";
  if (appMoneyModel?.flexibleSpending?.confidence === "low") return "Spending unclear";
  return "Good enough to plan";
}

function plainConfidence(value) {
  if (value === "high") return "Clear";
  if (value === "medium") return "Usable";
  return "Needs checking";
}

function getStatusStyle(tone) {
  const colors = {
    good: { background: "#ecfdf5", border: "#bbf7d0", color: "#166534" },
    warn: { background: "#fffbeb", border: "#fde68a", color: "#92400e" },
    bad: { background: "#fef2f2", border: "#fecaca", color: "#991b1b" },
  };
  const picked = colors[tone] || colors.warn;
  return {
    display: "grid",
    gap: 4,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    border: `1px solid ${picked.border}`,
    background: picked.background,
    color: picked.color,
    fontSize: 14,
  };
}

function formatTargetDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
