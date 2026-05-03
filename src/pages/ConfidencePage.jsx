import { useMemo, useState } from "react";
import { supabase } from "../supabase";
import { readCoachGeneratedChecks } from "../lib/coachGeneratedChecks";
import { normalizeText } from "../lib/finance";
import { Section, MiniCard } from "../components/ui";

const RULE_OPTIONS = [
  {
    label: "Rent",
    category: "Rent",
    isBill: true,
    isSubscription: false,
    isInternalTransfer: false,
    matchAmount: true,
    helper: "Use this for your landlord or housing payment.",
  },
  {
    label: "Bill",
    category: "Major bill",
    isBill: true,
    isSubscription: false,
    isInternalTransfer: false,
    matchAmount: true,
    helper: "Use this for bills you need money ready for.",
  },
  {
    label: "Subscription",
    category: "Subscription",
    isBill: false,
    isSubscription: true,
    isInternalTransfer: false,
    matchAmount: true,
    helper: "Use this for Netflix, Apple, memberships, app plans, gyms or similar.",
  },
  {
    label: "Wages/income",
    category: "Wages",
    isBill: false,
    isSubscription: false,
    isInternalTransfer: false,
    matchAmount: false,
    helper: "Use this for pay from work, wages, salary, benefits or reliable income.",
  },
  {
    label: "Friend/family",
    category: "Personal payment",
    isBill: false,
    isSubscription: false,
    isInternalTransfer: false,
    matchAmount: false,
    helper: "Use this for gifts, lending, paying people back, or help from people you know.",
  },
  {
    label: "Work/expense",
    category: "Work / pass-through",
    isBill: false,
    isSubscription: false,
    isInternalTransfer: false,
    matchAmount: false,
    helper: "Use this for expenses, resale, client money or reimbursement that is not really yours to spend.",
  },
  {
    label: "My own transfer",
    category: "Internal Transfer",
    isBill: false,
    isSubscription: false,
    isInternalTransfer: true,
    matchAmount: false,
    helper: "Use this for moving your own money between accounts or pots.",
  },
];

export default function ConfidencePage({
  transactions,
  transactionRules = [],
  moneyUnderstanding,
  onTransactionRulesChange,
  returnTarget,
  onBack,
  screenWidth,
  styles,
}) {
  const [savingKey, setSavingKey] = useState("");
  const [dismissedKeys, setDismissedKeys] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("moneyhub-dismissed-confidence-checks") || "[]");
    } catch {
      return [];
    }
  });
  const [message, setMessage] = useState("");

  const checks = useMemo(
    () => {
      const coachChecks = readCoachGeneratedChecks();
      return [...coachChecks, ...(moneyUnderstanding?.checks || [])]
        .filter((candidate) => !dismissedKeys.includes(candidate.key))
        .filter((candidate) => !hasAnsweredRule(candidate, transactionRules))
        .filter((candidate, index, all) =>
          all.findIndex((item) => item.key === candidate.key) === index
        )
        .map((candidate) => ({
          ...candidate,
          examples: getExamplesForCandidate(transactions, candidate),
        }));
    },
    [transactions, transactionRules, moneyUnderstanding, dismissedKeys]
  );
  const coachCheckCount = useMemo(
    () => readCoachGeneratedChecks()
      .filter((candidate) => !dismissedKeys.includes(candidate.key))
      .filter((candidate) => !hasAnsweredRule(candidate, transactionRules)).length,
    [dismissedKeys, transactionRules]
  );

  const completedCount = transactionRules.filter((rule) =>
    ["coach_confirmation", "recurring_major_payment", "confidence_check"].includes(rule.rule_type)
  ).length;

  async function saveRule(candidate, option) {
    setSavingKey(candidate.key);
    setMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("transaction_rules").upsert(
        {
          user_id: user.id,
          rule_type: "confidence_check",
          match_text: candidate.matchText,
          match_amount: option.matchAmount ? candidate.amount : null,
          category: option.category,
          is_bill: Boolean(option.isBill),
          is_subscription: Boolean(option.isSubscription),
          is_internal_transfer: Boolean(option.isInternalTransfer),
          notes: `User confirmed on Review page: ${option.label}. ${candidate.count} payments across ${candidate.monthCount} months. Example: ${candidate.sampleDescription}`,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,rule_type,match_text,match_amount" }
      );

      if (error) throw error;

      dismissCandidate(candidate, false);
      await onTransactionRulesChange?.();
      setMessage(`Saved: ${candidate.label} is ${option.label}. Money Hub will remember this next time.`);
    } catch (error) {
      setMessage(error.message || "Could not save that answer yet.");
    } finally {
      setSavingKey("");
    }
  }

  async function saveOtherRule(candidate) {
    const answer = window.prompt(
      `What is ${candidate.label}?\nExamples: Childcare, loan repayment, cash gift, pet costs, work expense`
    );

    if (!answer || !answer.trim()) return;

    await saveRule(candidate, {
      label: answer.trim(),
      category: answer.trim(),
      isBill: false,
      isSubscription: false,
      isInternalTransfer: false,
      matchAmount: false,
    });
  }

  function dismissCandidate(candidate, persist = true) {
    setDismissedKeys((prev) => {
      const next = [...new Set([...prev, candidate.key])];
      if (typeof window !== "undefined") {
        localStorage.setItem("moneyhub-dismissed-confidence-checks", JSON.stringify(next));
      }
      return next;
    });

    if (persist) {
      setMessage(`Skipped ${candidate.label}. If it appears again, you can answer it later.`);
    }
  }

  return (
    <>
      <Section styles={styles} title="Review">
        <p style={styles.sectionIntro}>
          Answer the tiny questions Money Hub cannot safely guess. One tap can fix your bills, transfers, totals and AI advice.
        </p>

        {returnTarget ? (
          <button type="button" style={getReturnButtonStyle(styles)} onClick={onBack}>
            ← Back to {returnTarget.label}
          </button>
        ) : null}

        <div style={getStatsGridStyle(screenWidth)}>
          <MiniCard styles={styles} title="Waiting" value={`${checks.length}`} />
          <MiniCard styles={styles} title="Answered" value={`${completedCount}`} />
          <MiniCard styles={styles} title="Why do this?" value="Better answers" />
        </div>

        {message ? <div style={styles.historyNote}>{message}</div> : null}
        {coachCheckCount > 0 ? (
          <div style={styles.historyNote}>
            Someone missing? Ask Coach with their name, or mark these as friend/family, wages, work expenses, your own transfer, or something else.
          </div>
        ) : null}
      </Section>

      {checks.length === 0 ? (
        <Section styles={styles} title="Nothing to confirm">
          <div style={styles.emptyCoachState}>
            <p style={styles.emptyCoachTitle}>Nothing waiting.</p>
            <p style={styles.emptyText}>
              When Money Hub is unsure about a repeated payment, it will ask here. If this page is empty, do not waste time here.
            </p>
          </div>
        </Section>
      ) : (
        <Section styles={styles} title="Please confirm these">
          {checks.map((candidate) => (
            <ConfidenceCard
              key={candidate.key}
              candidate={candidate}
              styles={styles}
              saving={savingKey === candidate.key}
              onSave={(option) => saveRule(candidate, option)}
              onOther={() => saveOtherRule(candidate)}
              onSkip={() => dismissCandidate(candidate)}
            />
          ))}
        </Section>
      )}
    </>
  );
}

function ConfidenceCard({ candidate, styles, saving, onSave, onOther, onSkip }) {
  return (
    <div style={styles.signalCard}>
      <div style={styles.signalHeader}>
        <div>
          <strong>{candidate.question || `What is ${candidate.label}?`}</strong>
          <p style={styles.transactionMeta}>
            {formatCheckPattern(candidate)} {candidate.helper || "Tell Money Hub what it is."}
          </p>
        </div>
        <button type="button" style={styles.ghostBtn} onClick={onSkip} disabled={saving}>
          Skip
        </button>
      </div>

      <div style={getExamplesStyle(styles)}>
        {candidate.examples.length > 0 ? (
          candidate.examples.map((item) => (
            <div key={`${item.date}-${item.description}-${item.amount}`} style={styles.transactionRow}>
              <div>
                <strong>{item.description}</strong>
                <p style={styles.transactionMeta}>{item.date || "No date"}</p>
              </div>
              <strong>£{Math.abs(Number(item.amount || 0)).toFixed(2)}</strong>
            </div>
          ))
        ) : (
          <p style={styles.smallMuted}>Example: {candidate.sampleDescription}</p>
        )}
      </div>

      <div style={getOptionGridStyle()}>
        {RULE_OPTIONS.map((option) => (
          <button
            key={option.label}
            type="button"
            style={getOptionButtonStyle(styles)}
            onClick={() => onSave(option)}
            disabled={saving}
            title={option.helper}
          >
            {saving ? "Saving..." : option.label}
          </button>
        ))}
        <button
          type="button"
          style={getOptionButtonStyle(styles)}
          onClick={onOther}
          disabled={saving}
        >
          Something else
        </button>
      </div>
    </div>
  );
}

function formatCheckPattern(candidate) {
  const amount = Number(candidate.amount || 0).toFixed(2);
  const count = Number(candidate.count || 0);
  const months = Number(candidate.monthCount || 0);
  const countText = count === 1 ? "once" : `${count} times`;
  const monthText = months <= 1 ? "1 month" : `${months} months`;
  return `About £${amount}, seen ${countText} across ${monthText}.`;
}

function hasAnsweredRule(candidate, transactionRules = []) {
  const match = normalizeText(candidate?.matchText || candidate?.label);
  if (!match) return false;

  return (transactionRules || []).some((rule) => {
    const ruleText = normalizeText(rule?.match_text || "");
    if (!ruleText) return false;
    return ruleText.includes(match) || match.includes(ruleText);
  });
}

function getExamplesForCandidate(transactions, candidate) {
  const match = normalizeText(candidate.matchText || candidate.label);
  if (!match) return [];
  const direction = candidate.direction || "outgoing";

  return transactions
    .filter((transaction) => {
      const amount = Number(transaction.amount || 0);
      if (direction === "incoming" && amount <= 0) return false;
      if (direction !== "incoming" && amount >= 0) return false;
      const text = normalizeText(transaction.description || "");
      return text.includes(match) || match.includes(text.slice(0, 12));
    })
    .slice(0, 3)
    .map((transaction) => ({
      date: transaction.transaction_date || "",
      description: transaction.description || "Transaction",
      amount: transaction.amount,
    }));
}

function getStatsGridStyle(screenWidth) {
  return {
    display: "grid",
    gridTemplateColumns: screenWidth <= 680 ? "1fr" : "repeat(3, minmax(0, 1fr))",
    gap: 10,
    marginTop: 12,
  };
}

function getExamplesStyle(styles) {
  return {
    ...styles.inlineInfoBlock,
    marginTop: 10,
    marginBottom: 10,
  };
}

function getReturnButtonStyle(styles) {
  return {
    marginTop: 12,
    border: "1px solid rgba(37, 99, 235, 0.24)",
    background: "#eff6ff",
    color: styles.primary,
    borderRadius: 999,
    padding: "10px 12px",
    fontWeight: 900,
    cursor: "pointer",
  };
}

function getOptionGridStyle() {
  return {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  };
}

function getOptionButtonStyle(styles) {
  return {
    ...(styles.secondaryInlineBtn || styles.ghostBtn),
    padding: "10px 12px",
  };
}
