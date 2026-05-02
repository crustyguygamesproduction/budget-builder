import { useState } from "react";
import { supabase } from "../supabase";
import { InsightCard, Row, Section } from "../components/ui";
import { buildGoalPlanFromMoneyModel } from "../lib/appMoneyModel";

export default function GoalsPage({
  goals,
  appMoneyModel,
  onGoToCoach,
  onNavigate,
  onChange,
  styles,
  helpers,
}) {
  const { formatCurrency, numberOrNull } = helpers;
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
          title="Recommended Goals"
          right={<button type="button" style={styles.ghostBtn} onClick={() => setShowGoalForm(true)}>Add your own</button>}
        >
          <p style={styles.sectionIntro}>
            Money Hub starts with safety, then growth. These are suggestions, not saved goals yet.
          </p>
          <div style={getRecommendationGridStyle()}>
            {recommendedGoals.map((goal) => (
              <InsightCard
                key={goal.key}
                styles={styles}
                label={goal.label}
                headline={`${goal.name} - ${formatCurrency(goal.target)}`}
                body={goal.body}
                ctaLabel="Save this goal"
                onClick={() => applyRecommendation(goal)}
              />
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

      <Section styles={styles} title="Safe Monthly Amount">
        <div style={getSafetyReadStyle(appMoneyModel?.savingsCapacity?.status)}>
          <strong>{appMoneyModel?.savingsCapacity?.label || "Needs better data"}</strong>
          <span>{appMoneyModel?.savingsCapacity?.body || "Upload statements so Money Hub can make this useful."}</span>
        </div>
        <div style={styles.inlineInfoBlock}>
          <Row styles={styles} name="Clear income" value={appMoneyModel?.income?.label || "Not clear yet"} />
          <Row styles={styles} name="Calendar bills" value={formatCurrency(appMoneyModel?.monthlyBillTotal || 0)} />
          <Row styles={styles} name="Usual spending" value={appMoneyModel?.flexibleSpending?.label || "Needs checking"} />
          <Row styles={styles} name="Checks waiting" value={`${appMoneyModel?.checksWaiting?.length || 0}`} />
        </div>
      </Section>

      <Section styles={styles} title="Next Step">
        <div style={styles.inlineBtnRow}>
          <button type="button" style={styles.primaryInlineBtn} onClick={() => onGoToCoach(planPrompt, { autoSend: true })}>
            Ask AI for a simple plan
          </button>
          {(appMoneyModel?.checksWaiting?.length || 0) > 0 ? (
            <button type="button" style={styles.secondaryInlineBtn} onClick={() => onNavigate("confidence")}>Answer Checks</button>
          ) : null}
          <button type="button" style={styles.secondaryInlineBtn} onClick={() => onNavigate("calendar")}>Check bills</button>
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
  const monthlyBills = Number(appMoneyModel?.monthlyBillTotal || 0);
  const usualSpending = Number(appMoneyModel?.flexibleSpending?.monthlyEstimate || 0);
  const safetyTarget = Math.max(500, roundToNearest(monthlyBills + usualSpending, 50));
  const growthTarget = Math.max(1000, roundToNearest(safetyTarget * 3, 100));

  return [
    {
      key: "safety",
      label: "Start here",
      name: "Safety buffer",
      target: safetyTarget,
      body: "One month of bills and normal spending. This is the goal that stops small problems becoming disasters.",
    },
    {
      key: "growth",
      label: "After safety",
      name: "Growth fund",
      target: growthTarget,
      body: "Once the safety buffer exists, this becomes the money for bigger progress: debt freedom, investing, a move, or a house.",
    },
  ];
}

function buildGoalCoachPrompt({ goal, appMoneyModel, formatCurrency }) {
  return [
    "Build a very simple Money Hub goal plan.",
    `Goal: ${goal?.name || "Safety buffer"}.`,
    `Target: ${formatCurrency(goal?.target || goal?.target_amount || 0)}.`,
    `Safe monthly amount: ${formatCurrency(appMoneyModel?.savingsCapacity?.safeMonthlyAmount || 0)}.`,
    `Calendar bills: ${formatCurrency(appMoneyModel?.monthlyBillTotal || 0)}.`,
    `Income: ${appMoneyModel?.income?.label || "not clear"}.`,
    `Usual spending: ${appMoneyModel?.flexibleSpending?.label || "needs checking"}.`,
    "Explain it for someone bad with money. Give one next action.",
  ].join(" ");
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
