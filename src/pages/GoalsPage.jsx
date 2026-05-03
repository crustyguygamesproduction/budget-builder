import { useState } from "react";
import { supabase } from "../supabase";
import { Row, Section } from "../components/ui";
import { buildGoalPlanFromMoneyModel } from "../lib/appMoneyModel";
import { formatCurrency, numberOrNull } from "../lib/finance";

export default function GoalsPage({
  goals,
  appMoneyModel,
  onGoToCoach,
  onNavigate,
  onChange,
  styles,
}) {
  const [saving, setSaving] = useState(false);
  const [activeGoalId, setActiveGoalId] = useState("");
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    target_amount: "",
    current_amount: "",
    target_date: "",
  });

  const recommendedGoals = getRecommendedGoals(appMoneyModel);
  const goalReality = getGoalReality(appMoneyModel);
  const activeGoal =
    goals.find((goal) => goal.id === activeGoalId) ||
    goals[0] ||
    null;
  const activePlan = activeGoal ? buildGoalPlanFromMoneyModel(activeGoal, appMoneyModel) : null;

  function applyRecommendation(goal) {
    setForm({
      name: goal.name,
      target_amount: String(goal.target),
      current_amount: "",
      target_date: "",
    });
    setShowGoalForm(true);
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

  const planPrompt = buildGoalCoachPrompt({
    goal: activeGoal || recommendedGoals[0],
    appMoneyModel,
    formatCurrency,
  });

  return (
    <>
      {activeGoal ? (
        <Section
          styles={styles}
          title="Your Goal"
          right={<button type="button" style={styles.ghostBtn} onClick={() => setShowGoalForm(true)}>Add goal</button>}
        >
          <div style={getGoalHeroStyle()}>
            <p style={styles.insightLabel}>Saved by you - {activePlan.status.label}</p>
            <h3 style={getGoalTitleStyle()}>{activeGoal.name || "Goal"}</h3>
            <p style={styles.goalStat}>{formatCurrency(activePlan.current)} / {formatCurrency(activePlan.target)}</p>
            <div style={styles.progressOuter}>
              <div style={{ ...styles.progressInner, width: `${activePlan.progressPercent}%` }} />
            </div>
            <p style={styles.sectionIntro}>{activePlan.status.body}</p>
          </div>
        </Section>
      ) : (
        <Section
          styles={styles}
          title="Smart Goals"
          right={<button type="button" style={styles.ghostBtn} onClick={() => setShowGoalForm(true)}>Add your own</button>}
        >
          <p style={styles.sectionIntro}>
            Pick one. Money Hub has worked these out from your income, outgoings and spending.
          </p>
          <div style={getRecommendationGridStyle()}>
            {recommendedGoals.map((goal) => (
              <button key={goal.key} type="button" style={getSmartGoalStyle(goal.tone)} onClick={() => applyRecommendation(goal)}>
                <span>{goal.label}</span>
                <strong>{goal.name}</strong>
                <b>{formatCurrency(goal.target)}</b>
                <small>{goal.body}</small>
                <em>{goal.reason}</em>
              </button>
            ))}
          </div>
        </Section>
      )}

      {showGoalForm ? (
        <Section styles={styles} title="Save Goal">
          <div style={getFormGridStyle()}>
            <input
              style={styles.input}
              placeholder="Goal name"
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
              placeholder="Saved already, optional"
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
        </Section>
      ) : null}

      <Section styles={styles} title="Goal Money">
        <div style={getSafetyReadStyle(appMoneyModel?.savingsCapacity?.status)}>
          <strong>{appMoneyModel?.savingsCapacity?.label || "Needs better data"}</strong>
          <span>{goalReality.mainAdvice}</span>
        </div>
        <div style={styles.inlineInfoBlock}>
          <Row styles={styles} name="Regular income" value={appMoneyModel?.income?.label || "Not clear yet"} />
          <Row styles={styles} name="Scheduled outgoings" value={formatCurrency(getMonthlyOutgoingsToCover(appMoneyModel))} />
          <Row styles={styles} name="Everyday spending" value={appMoneyModel?.flexibleSpending?.planningLabel || "Spending needs checking"} />
          <Row styles={styles} name="Best first move" value={goalReality.nextMove} />
        </div>
      </Section>

      <Section styles={styles} title="Next Step">
        <div style={styles.inlineBtnRow}>
          <button type="button" style={styles.primaryInlineBtn} onClick={() => onGoToCoach(planPrompt, { autoSend: true })}>
            Ask AI for a simple plan
          </button>
          {(appMoneyModel?.checksWaiting?.length || 0) > 0 ? (
            <button type="button" style={styles.secondaryInlineBtn} onClick={() => onNavigate("confidence", { returnToCurrent: true })}>Answer Review</button>
          ) : null}
          <button type="button" style={styles.secondaryInlineBtn} onClick={() => onNavigate("calendar", { returnToCurrent: true })}>Review bills</button>
        </div>
      </Section>

      {goals.length > 0 ? (
        <Section styles={styles} title="Saved Goals">
          {goals.map((goal) => {
            const plan = buildGoalPlanFromMoneyModel(goal, appMoneyModel);
            return (
              <button
                type="button"
                key={goal.id || goal.name}
                style={styles.actionCard}
                onClick={() => setActiveGoalId(goal.id)}
              >
                <p style={styles.insightLabel}>{plan.status.label}</p>
                <h4 style={styles.insightHeadline}>{goal.name || "Goal"}</h4>
                <p style={styles.insightBody}>{plan.progressPercent.toFixed(0)}% saved - {formatCurrency(plan.amountLeft)} left</p>
                <span style={styles.insightCta}>Open</span>
              </button>
            );
          })}
        </Section>
      ) : null}
    </>
  );
}

function getRecommendedGoals(appMoneyModel) {
  const monthlyBills = getMonthlyOutgoingsToCover(appMoneyModel);
  const usualSpending = appMoneyModel?.flexibleSpending?.isUsefulForPlanning
    ? Number(appMoneyModel?.flexibleSpending?.monthlyEstimate || 0)
    : 0;
  const income = Number(appMoneyModel?.income?.monthlyEstimate || 0);
  const safeSave = Number(appMoneyModel?.savingsCapacity?.safeMonthlyAmount || 0);
  const checks = appMoneyModel?.checksWaiting?.length || 0;
  const starterTarget = Math.max(100, roundToNearest(Math.min(monthlyBills || 300, Math.max(income * 0.1, 100)), 25));
  const safetyTarget = Math.max(500, roundToNearest(monthlyBills + usualSpending, 50));
  const chaosTarget = Math.max(250, roundToNearest((usualSpending || monthlyBills || 500) * 0.35, 25));
  const growthTarget = Math.max(1000, roundToNearest(safetyTarget * 3, 100));
  const goals = [];

  if (checks > 0 || safeSave <= 0) {
    goals.push({
      key: "starter",
      label: "Quick win",
      name: "Don't go backwards pot",
      target: starterTarget,
      tone: "urgent",
      body: "A small buffer first. This stops one awkward bill turning into panic.",
      reason: checks > 0 ? "Some money still needs confirming, so start small." : "Safe saving is not clear yet.",
    });
  }

  goals.push({
    key: "safety",
    label: safeSave > 0 ? "Best first goal" : "Next goal",
    name: "Safety buffer",
    target: safetyTarget,
    tone: "safe",
    body: usualSpending > 0
      ? "One month of outgoings and normal spending. Boring, but powerful."
      : "One month of scheduled outgoings while spending is still being learned.",
    reason: monthlyBills > 0 ? `Covers about one month of your real outgoings.` : "A sensible first safety net.",
  });

  if (usualSpending > 250) {
    goals.push({
      key: "spending-reset",
      label: "Real life",
      name: "Oops money",
      target: chaosTarget,
      tone: "warm",
      body: "For takeaways, taxis, forgotten stuff and life being annoying.",
      reason: "This keeps normal messy spending away from bill money.",
    });
  }

  goals.push({
    key: "growth",
    label: "After safety",
    name: "Growth fund",
    target: growthTarget,
    tone: "growth",
    body: "For debt freedom, investing, moving, a house, or finally feeling ahead.",
    reason: "Only push this once the safety buffer exists.",
  });

  return goals.slice(0, 3);
}

function getGoalReality(appMoneyModel) {
  const income = Number(appMoneyModel?.income?.monthlyEstimate || 0);
  const outgoings = getMonthlyOutgoingsToCover(appMoneyModel);
  const safeSave = Number(appMoneyModel?.savingsCapacity?.safeMonthlyAmount || 0);
  const checks = appMoneyModel?.checksWaiting?.length || 0;
  if (!income) {
    return { mainAdvice: "I need clearer income before I can suggest a confident saving amount.", nextMove: "Upload more wages history" };
  }
  if (checks > 0) {
    return { mainAdvice: "Answer Review first so bills and spending do not get mixed up.", nextMove: "Open Review" };
  }
  if (safeSave <= 0) {
    return { mainAdvice: "Do not set an automatic goal yet. Keep bill money safe first.", nextMove: "Protect bills" };
  }
  return {
    mainAdvice: `${formatCurrency(safeSave)} a month looks like the sensible goal amount right now.`,
    nextMove: outgoings > income ? "Fix shortfall" : "Save safely",
  };
}

function buildGoalCoachPrompt({ goal, appMoneyModel, formatCurrency }) {
  return [
    "Build a very simple Money Hub goal plan.",
    `Goal: ${goal?.name || "Safety buffer"}.`,
    `Target: ${formatCurrency(goal?.target || goal?.target_amount || 0)}.`,
    `Safe monthly amount: ${formatCurrency(appMoneyModel?.savingsCapacity?.safeMonthlyAmount || 0)}.`,
    `Scheduled outgoings to cover: ${formatCurrency(getMonthlyOutgoingsToCover(appMoneyModel))}.`,
    `Income: ${appMoneyModel?.income?.label || "not clear"}.`,
    `Everyday spending: ${appMoneyModel?.flexibleSpending?.planningLabel || "needs checking"}.`,
    "Explain it for someone bad with money. Give one next action.",
  ].join(" ");
}

function getMonthlyOutgoingsToCover(appMoneyModel) {
  return Number(
    appMoneyModel?.monthlyScheduledOutgoingsTotal ??
    appMoneyModel?.monthlyBillBurdenTotal ??
    appMoneyModel?.monthlyBillTotal ??
    0
  );
}

function roundToNearest(value, step) {
  return Math.ceil(Number(value || 0) / step) * step;
}

function getGoalHeroStyle() {
  return {
    display: "grid",
    gap: 10,
  };
}

function getGoalTitleStyle() {
  return {
    margin: 0,
    fontSize: 24,
    letterSpacing: 0,
  };
}

function getRecommendationGridStyle() {
  return {
    display: "grid",
    gap: 10,
  };
}

function getSmartGoalStyle(tone) {
  const palettes = {
    urgent: ["#fff7ed", "#fed7aa", "#9a3412"],
    safe: ["#ecfdf5", "#bbf7d0", "#166534"],
    warm: ["#fefce8", "#fde68a", "#854d0e"],
    growth: ["#eff6ff", "#bfdbfe", "#1d4ed8"],
  };
  const [background, border, color] = palettes[tone] || palettes.safe;
  return {
    display: "grid",
    gap: 7,
    textAlign: "left",
    padding: 14,
    borderRadius: 16,
    border: `1px solid ${border}`,
    background,
    color,
    cursor: "pointer",
  };
}

function getFormGridStyle() {
  return {
    display: "grid",
    gap: 10,
  };
}

function getSafetyReadStyle(status) {
  const tight = status === "not_safe" || status === "tight" || status === "needs_data";
  return {
    display: "grid",
    gap: 5,
    padding: 13,
    borderRadius: 16,
    border: tight ? "1px solid #fde68a" : "1px solid #bbf7d0",
    background: tight ? "#fffbeb" : "#ecfdf5",
    color: tight ? "#92400e" : "#166534",
    marginBottom: 12,
  };
}
