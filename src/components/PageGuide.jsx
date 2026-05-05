import { useEffect, useMemo, useState } from "react";
import {
  completePageGuide,
  hasCompletedPageGuide,
  ONBOARDING_REPLAY_EVENT,
} from "./onboarding/onboardingState";

export default function PageGuide({
  page,
  userId,
  screenWidth = 1024,
  transactions = [],
  appMoneyModel,
  goals = [],
  debts = [],
  investments = [],
  receipts = [],
  onNavigate,
  onGoToCoach,
}) {
  const [guideRefresh, setGuideRefresh] = useState(0);
  const guide = useMemo(
    () => getGuide(page, {
      transactionCount: transactions.length,
      checkCount: appMoneyModel?.checksWaiting?.length || 0,
      goalCount: goals.length,
      debtCount: debts.length,
      investmentCount: investments.length,
      receiptCount: receipts.length,
      scheduledOutgoings: appMoneyModel?.monthlyScheduledOutgoingsTotal ?? null,
    }),
    [appMoneyModel, debts.length, goals.length, investments.length, page, receipts.length, transactions.length]
  );

  useEffect(() => {
    function handleReplay() {
      setGuideRefresh((value) => value + 1);
    }

    window.addEventListener(ONBOARDING_REPLAY_EVENT, handleReplay);
    return () => window.removeEventListener(ONBOARDING_REPLAY_EVENT, handleReplay);
  }, []);

  const visible = Boolean(guide && userId && !hasCompletedPageGuide(userId, page) && guideRefresh >= 0);
  if (!guide || !visible) return null;

  const compact = screenWidth < 620;

  function close() {
    completePageGuide(userId, page);
    setGuideRefresh((value) => value + 1);
  }

  function runAction(action) {
    close();
    if (!action) return;
    if (action.type === "navigate") onNavigate?.(action.page, action.options || {});
    if (action.type === "coach") onGoToCoach?.(action.prompt, { autoSend: true });
  }

  return (
    <aside style={getGuideShellStyle(guide.tone, compact)} aria-label={`${guide.title} guide`}>
      <div style={getGuideTopStyle(compact)}>
        <div style={getGuideCopyStyle()}>
          <p style={getGuideEyebrowStyle()}>{guide.eyebrow}</p>
          <h2 style={getGuideTitleStyle(compact)}>{guide.title}</h2>
          <p style={getGuideBodyStyle()}>{guide.body}</p>
        </div>
        <div style={getPayoffStyle(guide.tone, compact)}>
          <span style={getPayoffLabelStyle()}>First payoff</span>
          <strong>{guide.payoff}</strong>
        </div>
      </div>

      <div style={getStepGridStyle(compact)}>
        {guide.steps.map((step, index) => (
          <div key={step} style={getStepStyle()}>
            <span style={getStepNumberStyle(guide.tone)}>{index + 1}</span>
            <p style={getStepTextStyle()}>{step}</p>
          </div>
        ))}
      </div>

      <div style={getGuideActionRowStyle()}>
        <button type="button" style={getPrimaryGuideButtonStyle(guide.tone)} onClick={() => runAction(guide.primaryAction)}>
          {guide.primaryLabel}
        </button>
        {guide.secondaryAction ? (
          <button type="button" style={getSecondaryGuideButtonStyle()} onClick={() => runAction(guide.secondaryAction)}>
            {guide.secondaryLabel}
          </button>
        ) : null}
        <button type="button" style={getDismissButtonStyle()} onClick={close}>
          Got it
        </button>
      </div>
    </aside>
  );
}

function getGuide(page, context) {
  const hasData = context.transactionCount > 0;
  const checksWaiting = context.checkCount > 0;

  const common = {
    uploadAction: { type: "navigate", page: "upload" },
    reviewAction: { type: "navigate", page: "confidence" },
    coachAction: {
      type: "coach",
      prompt: "Look at my clean money read and tell me the first thing to fix today. Keep it practical.",
    },
  };

  const guides = {
    today: {
      tone: checksWaiting ? "warn" : hasData ? "good" : "start",
      eyebrow: hasData ? "Daily money read" : "Start here",
      title: hasData ? "Make the app earn its keep today." : "Get a useful read before you do any budgeting.",
      body: hasData
        ? "Home is the control room: bills due, spending room, stale data and the next sensible move."
        : "One main-account CSV is enough to turn this from a blank app into a first money read.",
      payoff: hasData
        ? checksWaiting
          ? `${context.checkCount} check${context.checkCount === 1 ? "" : "s"} can clean up the numbers.`
          : "Your next action is already waiting here."
        : "Upload once, then see bills, spending room and the first Coach move.",
      steps: hasData
        ? ["Check whether the read is fresh", "Answer anything marked Review", "Ask Coach for the next move"]
        : ["Upload one current-account CSV", "Let Money Hub find bills and income", "Come back here for the first read"],
      primaryLabel: checksWaiting ? "Fix Review checks" : hasData ? "Ask Coach now" : "Upload first CSV",
      primaryAction: checksWaiting ? common.reviewAction : hasData ? common.coachAction : common.uploadAction,
      secondaryLabel: hasData ? "Open Calendar" : "Ask setup help",
      secondaryAction: hasData
        ? { type: "navigate", page: "calendar" }
        : { type: "coach", prompt: "I am new to Money Hub. Tell me the fastest setup path in three steps." },
    },
    upload: {
      tone: "start",
      eyebrow: "Fastest payoff",
      title: "Feed it real bank data, then stop sorting by hand.",
      body: "Upload CSV statements from your main account first. Three months is ideal, but one file still unlocks a useful read.",
      payoff: "The app can spot bills, waste, income rhythm and Review checks from the first import.",
      steps: ["Choose the main account CSV", "Check the preview catches dates and duplicates", "Save, then open Home or Review"],
      primaryLabel: "I am ready",
      primaryAction: null,
      secondaryLabel: "Ask Coach setup help",
      secondaryAction: { type: "coach", prompt: "Help me upload the right bank statements first. Keep it short." },
    },
    confidence: {
      tone: checksWaiting ? "warn" : "good",
      eyebrow: "Clean maths",
      title: checksWaiting ? "Answer one uncertain item and the whole app improves." : "Review is clear for now.",
      body: "This is where messy real-world statements become trustworthy. Transfers, refunds and shared money belong here before Coach uses the numbers.",
      payoff: checksWaiting
        ? `${context.checkCount} answer${context.checkCount === 1 ? "" : "s"} can stop bad advice before it starts.`
        : "No urgent checks means Coach can trust more of the current read.",
      steps: ["Confirm shared money and refunds", "Mark own transfers out of budget", "Let rules learn for future imports"],
      primaryLabel: checksWaiting ? "Start checking" : "Open Calendar",
      primaryAction: checksWaiting ? null : { type: "navigate", page: "calendar" },
      secondaryLabel: "Ask what matters",
      secondaryAction: { type: "coach", prompt: "Which Review checks matter most for making my budget accurate?" },
    },
    calendar: {
      tone: "focus",
      eyebrow: "Money already spoken for",
      title: "Calendar is the truth test for bills.",
      body: "Use this page before spending. It shows what has to be covered, what looks recurring, and where shared bills need confirmation.",
      payoff: context.scheduledOutgoings
        ? `Your personal scheduled outgoings are already being estimated.`
        : "Once bills are found, Home stops pretending all cash is spendable.",
      steps: ["Check the next bill", "Confirm rent, subs and debt payments", "Send weird items to Review"],
      primaryLabel: checksWaiting ? "Clean Review checks" : "Ask what is due soon",
      primaryAction: checksWaiting
        ? common.reviewAction
        : { type: "coach", prompt: "Look at my upcoming bills and tell me what I need to cover soon." },
      secondaryLabel: "Go Home",
      secondaryAction: { type: "navigate", page: "today" },
    },
    goals: {
      tone: "good",
      eyebrow: "Make progress visible",
      title: context.goalCount ? "Keep the next goal boring and achievable." : "Start with a safety pot, not a fantasy target.",
      body: "Goals should follow bills and real spending. The smart move is one clear pot that survives the next bad week.",
      payoff: context.goalCount ? `${context.goalCount} goal${context.goalCount === 1 ? "" : "s"} can be checked against real cash flow.` : "One safety goal gives Coach something practical to defend.",
      steps: ["Pick one goal", "Use safe monthly saving, not wishful saving", "Let Coach pressure-test it"],
      primaryLabel: context.goalCount ? "Check my goal" : "Ask for a starter goal",
      primaryAction: {
        type: "coach",
        prompt: context.goalCount
          ? "Check my goals against my bills and spending. Tell me what is realistic."
          : "Suggest the first realistic Money Hub goal from my current bills and spending.",
      },
      secondaryLabel: "Open Calendar",
      secondaryAction: { type: "navigate", page: "calendar" },
    },
    coach: {
      tone: "focus",
      eyebrow: "Blunt advice, clean numbers",
      title: "Ask for a decision, not a lecture.",
      body: "Coach uses the saved clean money brain: latest full month, recent averages, trend, checks and capped examples.",
      payoff: hasData ? "Ask what to fix first and it should use clean figures, not raw bank movement." : "After one upload, Coach can turn the read into a plain next move.",
      steps: ["Ask one practical question", "Look for timeframe-labelled numbers", "Send uncertainty back to Review"],
      primaryLabel: hasData ? "Ask the first fix" : "Upload data first",
      primaryAction: hasData ? common.coachAction : common.uploadAction,
      secondaryLabel: "Open Review",
      secondaryAction: common.reviewAction,
    },
    debts: {
      tone: "warn",
      eyebrow: "Pressure map",
      title: context.debtCount ? "Debt only works when payment pressure is visible." : "Add the one debt that can bite first.",
      body: "This page is for balances, due dates and minimums. It keeps debt payments out of vague spending advice.",
      payoff: context.debtCount ? `${context.debtCount} debt record${context.debtCount === 1 ? "" : "s"} can shape your monthly pressure read.` : "One balance plus one minimum payment makes the plan much less vague.",
      steps: ["Add lender, balance and minimum", "Attach a statement if you have one", "Ask Coach what to attack first"],
      primaryLabel: context.debtCount ? "Ask debt priority" : "I am ready",
      primaryAction: context.debtCount
        ? { type: "coach", prompt: "Use my debts, bills and spending to tell me which debt action matters first." }
        : null,
      secondaryLabel: "Open Upload",
      secondaryAction: common.uploadAction,
    },
    investments: {
      tone: "good",
      eyebrow: "Future money",
      title: context.investmentCount ? "Track investing without pretending it is spare cash." : "Add investments after bills are honest.",
      body: "Investing belongs beside the budget, not inside everyday spending. Keep contributions clear so Coach does not mistake them for waste.",
      payoff: context.investmentCount ? `${context.investmentCount} investment record${context.investmentCount === 1 ? "" : "s"} can be kept separate from spending.` : "A clean investment record stops transfers being judged as normal spending.",
      steps: ["Add platform and account type", "Record regular contributions", "Keep safety cash ahead of risk"],
      primaryLabel: context.investmentCount ? "Check investing pace" : "I am ready",
      primaryAction: context.investmentCount
        ? { type: "coach", prompt: "Check whether my investing pace makes sense after bills, debt and safety cash." }
        : null,
      secondaryLabel: "Open Goals",
      secondaryAction: { type: "navigate", page: "goals" },
    },
    receipts: {
      tone: "focus",
      eyebrow: "Proof and cleanup",
      title: context.receiptCount ? "Receipts make odd spending explainable." : "Use receipts for the stuff you might forget later.",
      body: "Attach proof to payments that need context: work expenses, returns, big purchases or anything you may need to claim back.",
      payoff: context.receiptCount ? `${context.receiptCount} receipt${context.receiptCount === 1 ? "" : "s"} saved against your money record.` : "One receipt can turn a mystery transaction into a clean record.",
      steps: ["Upload the receipt", "Match it to the payment", "Let refunds and claims stay visible"],
      primaryLabel: "I am ready",
      primaryAction: null,
      secondaryLabel: "Open Review",
      secondaryAction: common.reviewAction,
    },
    settings: {
      tone: "focus",
      eyebrow: "Control room",
      title: "This is where trust is protected.",
      body: "Use Settings for privacy, replaying guides, sharing read-only access and cleaning up bad uploads.",
      payoff: "You can restart the guidance or delete wrong data without hunting through pages.",
      steps: ["Check plan and data controls", "Replay page guides when needed", "Use deletion tools carefully"],
      primaryLabel: "Privacy",
      primaryAction: { type: "navigate", page: "privacy" },
      secondaryLabel: "Go Home",
      secondaryAction: { type: "navigate", page: "today" },
    },
    privacy: {
      tone: "focus",
      eyebrow: "Plain English privacy",
      title: "Read this when you want the data deal in human language.",
      body: "Money Hub should be blunt about money and boring about privacy: clear, controlled and deletable.",
      payoff: "You know what is stored, what AI sees, and how to remove it.",
      steps: ["Check AI data use", "Check storage and deletion", "Return to Settings if you need controls"],
      primaryLabel: "Back to Settings",
      primaryAction: { type: "navigate", page: "settings" },
      secondaryLabel: "Go Home",
      secondaryAction: { type: "navigate", page: "today" },
    },
  };

  return guides[page] || null;
}

function getGuideShellStyle(tone, compact) {
  const accents = {
    start: ["#2563eb", "#14b8a6"],
    good: ["#059669", "#2563eb"],
    warn: ["#b45309", "#2563eb"],
    focus: ["#0f172a", "#0891b2"],
  }[tone] || ["#2563eb", "#14b8a6"];

  return {
    position: "relative",
    margin: "0 0 14px",
    padding: compact ? "16px" : "18px",
    border: "1px solid rgba(203, 213, 225, 0.82)",
    borderRadius: "24px",
    background: `linear-gradient(135deg, rgba(255,255,255,0.96), rgba(248,251,255,0.92) 54%, ${hexToRgba(accents[1], 0.10)})`,
    boxShadow: "0 18px 48px rgba(15, 23, 42, 0.08)",
    overflow: "hidden",
  };
}

function getGuideTopStyle(compact) {
  return {
    display: "grid",
    gridTemplateColumns: compact ? "1fr" : "minmax(0, 1.35fr) minmax(190px, 0.65fr)",
    gap: "14px",
    alignItems: "stretch",
  };
}

function getGuideCopyStyle() {
  return { minWidth: 0 };
}

function getGuideEyebrowStyle() {
  return {
    margin: "0 0 6px",
    color: "#2563eb",
    fontSize: "11px",
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  };
}

function getGuideTitleStyle(compact) {
  return {
    margin: 0,
    color: "#0f172a",
    fontSize: compact ? "22px" : "26px",
    lineHeight: 1.06,
    letterSpacing: 0,
  };
}

function getGuideBodyStyle() {
  return {
    margin: "8px 0 0",
    color: "#526174",
    fontSize: "14px",
    lineHeight: 1.45,
  };
}

function getPayoffStyle(tone, compact) {
  const background = tone === "warn" ? "#fff7ed" : tone === "good" ? "#ecfdf5" : "#eff6ff";
  const border = tone === "warn" ? "#fed7aa" : tone === "good" ? "#bbf7d0" : "#bfdbfe";
  return {
    minHeight: compact ? "auto" : "100%",
    padding: "13px",
    borderRadius: "18px",
    background,
    border: `1px solid ${border}`,
    display: "grid",
    alignContent: "center",
    gap: "5px",
    color: "#0f172a",
  };
}

function getPayoffLabelStyle() {
  return {
    color: "#64748b",
    fontSize: "11px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };
}

function getStepGridStyle(compact) {
  return {
    display: "grid",
    gridTemplateColumns: compact ? "1fr" : "repeat(3, minmax(0, 1fr))",
    gap: "9px",
    marginTop: "14px",
  };
}

function getStepStyle() {
  return {
    display: "grid",
    gridTemplateColumns: "26px minmax(0, 1fr)",
    gap: "8px",
    alignItems: "start",
    minHeight: "54px",
    padding: "10px",
    borderRadius: "16px",
    background: "rgba(255, 255, 255, 0.74)",
    border: "1px solid rgba(226, 232, 240, 0.92)",
  };
}

function getStepNumberStyle(tone) {
  const background = tone === "warn" ? "#f59e0b" : tone === "good" ? "#10b981" : "#2563eb";
  return {
    width: "24px",
    height: "24px",
    borderRadius: "999px",
    display: "grid",
    placeItems: "center",
    background,
    color: "white",
    fontSize: "12px",
    fontWeight: 900,
  };
}

function getStepTextStyle() {
  return {
    margin: 0,
    color: "#334155",
    fontSize: "13px",
    lineHeight: 1.35,
    fontWeight: 800,
  };
}

function getGuideActionRowStyle() {
  return {
    display: "flex",
    flexWrap: "wrap",
    gap: "9px",
    alignItems: "center",
    marginTop: "14px",
  };
}

function getPrimaryGuideButtonStyle(tone) {
  const background = tone === "warn" ? "#b45309" : tone === "good" ? "#047857" : "#0f172a";
  return {
    border: 0,
    borderRadius: "16px",
    padding: "11px 14px",
    background,
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  };
}

function getSecondaryGuideButtonStyle() {
  return {
    border: "1px solid #dbe4ef",
    borderRadius: "16px",
    padding: "10px 13px",
    background: "rgba(255,255,255,0.88)",
    color: "#253348",
    fontWeight: 900,
    cursor: "pointer",
  };
}

function getDismissButtonStyle() {
  return {
    marginLeft: "auto",
    border: 0,
    borderRadius: "14px",
    padding: "10px 11px",
    background: "transparent",
    color: "#64748b",
    fontWeight: 900,
    cursor: "pointer",
  };
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
