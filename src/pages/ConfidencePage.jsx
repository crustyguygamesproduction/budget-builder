import { useMemo, useState } from "react";
import { supabase } from "../supabase";
import { normalizeText } from "../lib/finance";
import { dismissReviewCheckKey, readDismissedReviewCheckKeys } from "../lib/reviewDismissals";
import { REVIEW_RULE_OPTIONS } from "../lib/reviewOptions";
import { buildVisibleReviewChecks, getCandidateMatchText } from "../lib/reviewQueue";
import { Section, MiniCard } from "../components/ui";

export default function ConfidencePage({
  transactions,
  transactionRules = [],
  moneyUnderstanding,
  reviewChecks = null,
  onTransactionRulesChange,
  returnTarget,
  onBack,
  screenWidth,
  styles,
}) {
  const [savingKey, setSavingKey] = useState("");
  const [dismissedKeys, setDismissedKeys] = useState(() => {
    return readDismissedReviewCheckKeys();
  });
  const [message, setMessage] = useState("");

  const checks = useMemo(
    () => {
      const sourceChecks = Array.isArray(reviewChecks)
        ? reviewChecks
        : buildVisibleReviewChecks({ moneyUnderstanding, transactionRules, dismissedCheckKeys: dismissedKeys });
      return sourceChecks
        .map((candidate) => ({
          ...candidate,
          examples: getExamplesForCandidate(transactions, candidate),
        }));
    },
    [transactions, transactionRules, moneyUnderstanding, dismissedKeys, reviewChecks]
  );
  const coachCheckCount = useMemo(
    () => checks.filter((candidate) => candidate?.source === "coach").length,
    [checks]
  );

  const handledCount = transactionRules.filter((rule) =>
    ["coach_confirmation", "recurring_major_payment", "confidence_check", "shared_bill_contribution", "confidence_check_skipped"].includes(rule.rule_type)
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
          rule_type: option.ruleType || "confidence_check",
          match_text: getCandidateMatchText(candidate),
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

      dismissCandidateLocal(candidate);
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

  function dismissCandidateLocal(candidate) {
    setDismissedKeys(dismissReviewCheckKey(candidate.key));
  }

  async function skipCandidate(candidate) {
    if (!candidate || savingKey) return;
    setSavingKey(candidate.key);
    setMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("transaction_rules").upsert(
        {
          user_id: user.id,
          rule_type: "confidence_check_skipped",
          match_text: getCandidateMatchText(candidate),
          match_amount: candidate.amount ?? null,
          category: "Skipped Review",
          is_bill: false,
          is_subscription: false,
          is_internal_transfer: false,
          notes: `User skipped this Review check without changing money treatment. Example: ${candidate.sampleDescription || candidate.label}`,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,rule_type,match_text,match_amount" }
      );

      if (error) throw error;

      dismissCandidateLocal(candidate);
      await onTransactionRulesChange?.();
      setMessage(`Skipped ${candidate.label}. Money Hub will stop counting it as a waiting Review item.`);
    } catch (error) {
      setMessage(error.message || "Could not skip that check yet.");
    } finally {
      setSavingKey("");
    }
  }

  return (
    <>
      <Section styles={styles} title="Review">
        <p style={styles.sectionIntro}>
          Answer only what matters. Skip means "stop asking me about this"; choose an option when you want Money Hub to learn the right rule.
        </p>

        {returnTarget ? (
          <button type="button" style={getReturnButtonStyle(styles)} onClick={onBack}>
            ← Back to {returnTarget.label}
          </button>
        ) : null}

        <div style={getStatsGridStyle(screenWidth)}>
          <MiniCard styles={styles} title="Waiting" value={`${checks.length}`} />
          <MiniCard styles={styles} title="Handled" value={`${handledCount}`} />
          <MiniCard styles={styles} title="Why do this?" value="Better answers" />
        </div>

        {message ? <div style={styles.historyNote}>{message}</div> : null}
        {coachCheckCount > 0 ? (
          <div style={styles.historyNote}>
            Use plain answers like Normal purchase, One-off payment, My own transfer, or Irrelevant / exclude when the app is overthinking a transaction.
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
              onSkip={() => skipCandidate(candidate)}
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
          Skip this
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
        {REVIEW_RULE_OPTIONS.map((option) => (
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

function getExamplesForCandidate(transactions, candidate) {
  const match = normalizeText(candidate.matchText || candidate.label);
  if (!match) return [];
  const direction = candidate.direction || "outgoing";

  const matches = transactions.filter((transaction) => {
      const amount = Number(transaction.amount || 0);
      if (direction === "incoming" && amount <= 0) return false;
      if (direction !== "incoming" && amount >= 0) return false;
      const text = normalizeText(transaction.description || "");
      return text.includes(match) || match.includes(text.slice(0, 12));
    });

  return dedupeExampleTransactions(matches)
    .slice(0, 3)
    .map((transaction) => ({
      date: transaction.transaction_date || "",
      description: transaction.description || "Transaction",
      amount: transaction.amount,
    }));
}

function dedupeExampleTransactions(transactions = []) {
  const seen = new Set();
  return transactions.filter((transaction) => {
    const key = [
      transaction.transaction_date || "",
      normalizeText(transaction.description || ""),
      Number(transaction.amount || 0).toFixed(2),
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
