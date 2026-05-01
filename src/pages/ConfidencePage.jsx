import { useMemo, useState } from "react";
import { supabase } from "../supabase";
import {
  buildRecurringMajorPaymentCandidates,
} from "../lib/transactionCategorisation";
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
    helper: "Use this for landlord or fixed housing payments.",
  },
  {
    label: "Bill",
    category: "Major bill",
    isBill: true,
    isSubscription: false,
    isInternalTransfer: false,
    matchAmount: true,
    helper: "Use this for important repeated costs that must be protected.",
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
    label: "Work/pass-through",
    category: "Work / pass-through",
    isBill: false,
    isSubscription: false,
    isInternalTransfer: false,
    matchAmount: false,
    helper: "Use this when money comes in and goes back out for work, expenses, resale, or reimbursement.",
  },
  {
    label: "Transfer",
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
  onTransactionRulesChange,
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
    () =>
      buildRecurringMajorPaymentCandidates(transactions, transactionRules)
        .filter((candidate) => !dismissedKeys.includes(candidate.key))
        .map((candidate) => ({
          ...candidate,
          examples: getExamplesForCandidate(transactions, candidate),
        })),
    [transactions, transactionRules, dismissedKeys]
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
          notes: `User confirmed on Confidence Checks page: ${option.label}. ${candidate.count} payments across ${candidate.monthCount} months. Example: ${candidate.sampleDescription}`,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,rule_type,match_text,match_amount" }
      );

      if (error) throw error;

      dismissCandidate(candidate, false);
      await onTransactionRulesChange?.();
      setMessage(`Saved: ${candidate.label} is ${option.label}. Future totals will use this.`);
    } catch (error) {
      setMessage(error.message || "Could not save that rule yet.");
    } finally {
      setSavingKey("");
    }
  }

  async function saveOtherRule(candidate) {
    const answer = window.prompt(
      `What should Money Hub call ${candidate.label}?\nExamples: Childcare, Loan repayment, Cash gift, Pet costs, Work expense`
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
      setMessage(`Skipped ${candidate.label}. You can still fix it later if it appears again.`);
    }
  }

  return (
    <>
      <Section styles={styles} title="Confidence Checks">
        <p style={styles.sectionIntro}>
          Help Money Hub stop guessing. Confirm unclear repeated payments once, and the app will use that rule in totals, bills, goals and AI answers.
        </p>

        <div style={getStatsGridStyle(screenWidth)}>
          <MiniCard styles={styles} title="Checks waiting" value={`${checks.length}`} />
          <MiniCard styles={styles} title="Rules saved" value={`${completedCount}`} />
          <MiniCard styles={styles} title="Why it matters" value="Cleaner maths" />
        </div>

        {message ? <div style={styles.historyNote}>{message}</div> : null}
      </Section>

      {checks.length === 0 ? (
        <Section styles={styles} title="Nothing urgent">
          <div style={styles.emptyCoachState}>
            <p style={styles.emptyCoachTitle}>No confidence checks right now.</p>
            <p style={styles.emptyText}>
              As you upload more statements, Money Hub will ask simple questions here when a payment could affect the maths.
            </p>
          </div>
        </Section>
      ) : (
        <Section styles={styles} title="Needs your answer">
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
          <strong>What is {candidate.label}?</strong>
          <p style={styles.transactionMeta}>
            About £{Number(candidate.amount || 0).toFixed(2)} repeated {candidate.count} times across {candidate.monthCount} month{candidate.monthCount === 1 ? "" : "s"}.
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
          Other
        </button>
      </div>
    </div>
  );
}

function getExamplesForCandidate(transactions, candidate) {
  const match = normalizeText(candidate.matchText || candidate.label);
  if (!match) return [];

  return transactions
    .filter((transaction) => {
      if (Number(transaction.amount || 0) >= 0) return false;
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
