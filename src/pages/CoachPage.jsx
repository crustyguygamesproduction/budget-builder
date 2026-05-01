import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { buildCoachContext } from "../lib/coachContext";
import { getTotals } from "../lib/finance";
import { buildRecurringMajorPaymentCandidates } from "../lib/transactionCategorisation";
import { Section } from "../components/ui";

const COACH_DISPLAY_LIMIT = 18;
const COACH_DRAFT_KEY = "moneyhub-coach-draft";
const COACH_AUTOSEND_KEY = "moneyhub-coach-autosend";
const COACH_FRESH_CUTOFF_KEY = "moneyhub-coach-fresh-cutoff";

export default function CoachPage({
  transactions,
  transactionRules = [],
  goals,
  debts,
  investments,
  debtSignals,
  investmentSignals,
  aiMessages,
  subscriptionStatus,
  bankFeedReadiness,
  onChange,
  onTransactionRulesChange,
  screenWidth,
  viewportHeight,
  styles,
  helpers,
}) {
  const [message, setMessage] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(COACH_DRAFT_KEY) || "";
  });
  const [pendingUserMessage, setPendingUserMessage] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [savingRuleKey, setSavingRuleKey] = useState("");
  const [dismissedRuleKeys, setDismissedRuleKeys] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("moneyhub-dismissed-rule-checks") || "[]");
    } catch {
      return [];
    }
  });
  const [chatError, setChatError] = useState("");
  const [freshCutoff, setFreshCutoff] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(COACH_FRESH_CUTOFF_KEY) || new Date().toISOString();
  });

  const chatBottomRef = useRef(null);
  const latestMessageRef = useRef(null);

  const totals = useMemo(() => getTotals(transactions), [transactions]);
  const topCategories = useMemo(() => helpers.getTopCategories(transactions), [helpers, transactions]);
  const subscriptionSummary = useMemo(
    () => helpers.getSubscriptionSummary(transactions),
    [helpers, transactions]
  );
  const dataFreshness = useMemo(() => helpers.getDataFreshness(transactions), [helpers, transactions]);
  const correctionCandidates = useMemo(
    () => buildRecurringMajorPaymentCandidates(transactions, transactionRules)
      .filter((candidate) => !dismissedRuleKeys.includes(candidate.key))
      .slice(0, 1),
    [transactions, transactionRules, dismissedRuleKeys]
  );
  const activeCorrectionCandidate = correctionCandidates[0] || null;

  const houseGoal =
    goals.find((goal) =>
      String(goal.name || "").toLowerCase().includes("house")
    ) || null;

  const baseMessages = useMemo(
    () =>
      freshCutoff
        ? aiMessages.filter(
            (msg) => !msg.created_at || msg.created_at >= freshCutoff
          )
        : aiMessages,
    [aiMessages, freshCutoff]
  );

  const visibleMessages = useMemo(
    () => baseMessages.slice(-COACH_DISPLAY_LIMIT),
    [baseMessages]
  );
  const hiddenCount = Math.max(baseMessages.length - visibleMessages.length, 0);
  const hiddenOlderByFreshView = Math.max(aiMessages.length - baseMessages.length, 0);
  const latestVisibleMessageKey = visibleMessages.length
    ? `${visibleMessages[visibleMessages.length - 1]?.id || ""}-${visibleMessages[visibleMessages.length - 1]?.created_at || ""}-${visibleMessages.length}`
    : "empty";
  const quickPrompts = getSmartCoachPrompts({ topCategories, houseGoal, debtSignals, investmentSignals });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const shouldAutoSend = localStorage.getItem(COACH_AUTOSEND_KEY) === "true";
    const draft = localStorage.getItem(COACH_DRAFT_KEY) || "";

    localStorage.removeItem(COACH_DRAFT_KEY);
    localStorage.removeItem(COACH_AUTOSEND_KEY);

    if (shouldAutoSend && draft.trim()) {
      sendMessage(draft);
    }
    // This only consumes a one-shot draft left by navigation into the coach.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("moneyhub-dismissed-rule-checks", JSON.stringify(dismissedRuleKeys));
  }, [dismissedRuleKeys]);

  useEffect(() => {
    if (thinking) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }
    latestMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [latestVisibleMessageKey, pendingUserMessage, thinking]);

  async function sendMessage(nextMessage) {
    const text = String(nextMessage ?? message).trim();
    if (!text || thinking) return;

    setMessage("");
    setPendingUserMessage({
      id: `pending-${Date.now()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    });
    setThinking(true);
    setChatError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      await supabase.from("ai_messages").insert({
        user_id: user.id,
        role: "user",
        content: text,
      });

      const context = buildCoachContext({
        transactions,
        debts,
        investments,
        debtSignals,
        investmentSignals,
        totals,
        topCategories,
        subscriptionSummary,
        dataFreshness,
        baseMessages,
        helpers,
        userMessage: text,
        subscriptionStatus,
        bankFeedReadiness,
      });

      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          mode: "coach",
          message: text,
          context,
        },
      });

      if (error) {
        throw new Error(error.message || "AI request failed.");
      }

      await supabase.from("ai_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: data?.reply || "No reply received.",
      });

      setPendingUserMessage(null);
      await onChange();
    } catch (error) {
      setMessage(text);
      setPendingUserMessage(null);
      setChatError(error.message || "Something went wrong sending that message.");
    } finally {
      setThinking(false);
    }
  }

  async function saveCorrectionRule(candidate, rule) {
    if (!candidate || savingRuleKey) return;

    setSavingRuleKey(candidate.key);
    setChatError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("transaction_rules").upsert(
        {
          user_id: user.id,
          rule_type: "coach_confirmation",
          match_text: candidate.matchText,
          match_amount: rule.matchAmount ? candidate.amount : null,
          category: rule.category,
          is_bill: Boolean(rule.isBill),
          is_subscription: Boolean(rule.isSubscription),
          is_internal_transfer: Boolean(rule.isInternalTransfer),
          notes: `User confirmed in AI Coach: ${rule.label}. ${candidate.count} payments across ${candidate.monthCount} months. Example: ${candidate.sampleDescription}`,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,rule_type,match_text,match_amount" }
      );

      if (error) throw error;

      setDismissedRuleKeys((prev) => [...new Set([...prev, candidate.key])]);
      await onTransactionRulesChange?.();
    } catch (error) {
      setChatError(error.message || "Could not save that correction yet.");
    } finally {
      setSavingRuleKey("");
    }
  }

  function dismissCorrection(candidate) {
    if (!candidate) return;
    setDismissedRuleKeys((prev) => [...new Set([...prev, candidate.key])]);
  }

  async function clearChat() {
    if (clearing || aiMessages.length === 0) return;

    const confirmed = window.confirm(
      "Clear your saved AI chat history? This removes the current conversation log."
    );

    if (!confirmed) return;

    setClearing(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("ai_messages")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;

      setPendingUserMessage(null);
      setFreshCutoff("");
      if (typeof window !== "undefined") {
        localStorage.removeItem(COACH_FRESH_CUTOFF_KEY);
      }

      await onChange();
    } catch (error) {
      setChatError(error.message || "Could not clear chat.");
    } finally {
      setClearing(false);
    }
  }

  function startFreshView() {
    const cutoff = new Date().toISOString();
    setFreshCutoff(cutoff);
    setPendingUserMessage(null);
    setChatError("");

    if (typeof window !== "undefined") {
      localStorage.setItem(COACH_FRESH_CUTOFF_KEY, cutoff);
    }
  }

  function showAllHistory() {
    setFreshCutoff("");
    setPendingUserMessage(null);
    setChatError("");

    if (typeof window !== "undefined") {
      localStorage.removeItem(COACH_FRESH_CUTOFF_KEY);
    }
  }

  return (
    <>
      <Section
        title="Money check"
        sectionStyle={getCoachSectionStyle(viewportHeight, screenWidth, styles)}
        styles={styles}
        right={
          <div style={getCoachActionsStyle(screenWidth, styles)}>
            <button
              style={styles.ghostBtn}
              onClick={freshCutoff ? showAllHistory : startFreshView}
              disabled={thinking}
            >
              {freshCutoff ? "History" : "New"}
            </button>

            <button
              style={styles.ghostBtn}
              onClick={clearChat}
              disabled={clearing || aiMessages.length === 0}
            >
              {clearing ? "..." : "Clear"}
            </button>
          </div>
        }
      >
        <div style={getCoachShellStyle(styles)}>
          <div style={getQuickPromptRowStyle(screenWidth, styles)}>
            {quickPrompts.map((prompt) => (
              <button
                key={prompt.label}
                style={styles.promptChip}
                onClick={() => sendMessage(prompt.message)}
                disabled={thinking}
              >
                {prompt.label}
              </button>
            ))}
          </div>

          <div style={getChatMessagesStyle(styles)}>
            {freshCutoff && hiddenOlderByFreshView > 0 && (
              <div style={styles.historyNote}>New chat. History is still saved.</div>
            )}

            {!freshCutoff && hiddenCount > 0 && (
              <div style={styles.historyNote}>Showing the latest messages.</div>
            )}

            {chatError && <div style={styles.errorNote}>{chatError}</div>}

            {visibleMessages.length === 0 && !pendingUserMessage ? (
              <div style={getEmptyCoachStateStyle(screenWidth, styles)}>
                <p style={styles.emptyCoachTitle}>What do you want to check?</p>
                <p style={styles.emptyText}>
                  Ask about bills, goals, spending, debt, or whether you can afford something.
                </p>
              </div>
            ) : (
              visibleMessages.map((msg, index) => (
                <div
                  key={msg.id || `${msg.role}-${msg.created_at}-${index}`}
                  ref={index === visibleMessages.length - 1 && !pendingUserMessage ? latestMessageRef : null}
                >
                  <ChatMessage msg={msg} styles={styles} />
                </div>
              ))
            )}

            {pendingUserMessage ? (
              <div ref={latestMessageRef}>
                <ChatMessage msg={pendingUserMessage} styles={styles} />
              </div>
            ) : null}

            {thinking && (
              <div style={styles.aiBubbleModern}>
                <div style={styles.chatMetaRow}>
                  <span style={styles.chatRoleLabel}>Money Hub</span>
                  <span style={styles.chatTimeLabel}>now</span>
                </div>
                Checking your money...
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          <div style={getChatInputBarStyle(styles)}>
            <input
              style={styles.chatInput}
              placeholder="Ask a money question..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
            />

            <button
              style={getChatSendBtnStyle(styles)}
              onClick={() => sendMessage()}
              disabled={thinking || !message.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </Section>

      {activeCorrectionCandidate ? (
        <CorrectionModal
          candidate={activeCorrectionCandidate}
          styles={styles}
          saving={savingRuleKey === activeCorrectionCandidate.key}
          onSave={(rule) => saveCorrectionRule(activeCorrectionCandidate, rule)}
          onDismiss={() => dismissCorrection(activeCorrectionCandidate)}
        />
      ) : null}
    </>
  );
}

function CorrectionModal({ candidate, styles, saving, onSave, onDismiss }) {
  const rules = [
    { label: "Rent", category: "Rent", isBill: true, isSubscription: false, isInternalTransfer: false, matchAmount: true },
    { label: "Friend/family", category: "Personal payment", isBill: false, isSubscription: false, isInternalTransfer: false, matchAmount: false },
    { label: "Work/pass-through", category: "Work / pass-through", isBill: false, isSubscription: false, isInternalTransfer: false, matchAmount: false },
    { label: "Transfer", category: "Internal Transfer", isBill: false, isSubscription: false, isInternalTransfer: true, matchAmount: false },
  ];

  return (
    <div style={getModalOverlayStyle()} role="dialog" aria-modal="true">
      <div style={getCorrectionSheetStyle(styles)}>
        <div style={styles.chatMetaRow}>
          <span style={styles.chatRoleLabel}>Quick check</span>
          <span style={styles.chatTimeLabel}>keeps maths right</span>
        </div>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>
          What is {candidate.label}?
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.45, color: "#64748b", marginBottom: 12 }}>
          I am not fully sure how to treat this. I found about £{Number(candidate.amount || 0).toFixed(2)} repeated {candidate.count} times. Your answer will be saved as a rule and future totals will update.
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {rules.map((rule) => (
            <button
              key={rule.label}
              type="button"
              style={getCorrectionOptionStyle(styles)}
              onClick={() => onSave(rule)}
              disabled={saving}
            >
              {saving ? "Saving..." : rule.label}
            </button>
          ))}
          <button
            type="button"
            style={styles.ghostBtn}
            onClick={onDismiss}
            disabled={saving}
          >
            Ask me later
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatMessage({ msg, styles }) {
  const isUser = msg.role === "user";

  return (
    <div style={isUser ? styles.userBubbleModern : styles.aiBubbleModern}>
      <div style={styles.chatMetaRow}>
        <span style={styles.chatRoleLabel}>{isUser ? "You" : "Money Hub"}</span>
        <span style={styles.chatTimeLabel}>{formatChatTime(msg.created_at)}</span>
      </div>
      {msg.content}
    </div>
  );
}

function formatChatTime(value) {
  if (!value) return "now";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "now";

  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getSmartCoachPrompts({ topCategories, houseGoal, debtSignals, investmentSignals }) {
  const prompts = [
    { label: "Can I afford this?", message: "Can I afford something right now? Check my bills, goals and spending room first." },
    { label: "What should I fix?", message: "What is the first thing I should fix with my money? Keep it practical." },
    { label: "Am I on track?", message: "Am I on track with my money and goals? Give me the honest version." },
    { label: "Bills due soon", message: "What bills or regular payments should I be ready for soon?" },
    { label: "Find waste", message: "Find the easiest waste or leaks in my spending." },
  ];

  const topCategory = topCategories.find((item) => {
    const category = String(item?.category || "").trim().toLowerCase();
    return category && !["spending", "uncategorised", "income"].includes(category);
  });

  if (topCategory) {
    prompts.push({
      label: `Cut ${topCategory.category}`,
      message: `Look at my ${topCategory.category} spending and tell me what is realistic to cut.`,
    });
  } else if (houseGoal) {
    prompts.push({
      label: "Goal plan",
      message: "Help me protect my main goal without making life miserable.",
    });
  } else if (debtSignals.length > 0) {
    prompts.push({
      label: "Debt check",
      message: "Check whether my debt-looking payments seem under control.",
    });
  } else if (investmentSignals.length > 0) {
    prompts.push({
      label: "Investing check",
      message: "Does my investing activity look sensible?",
    });
  }

  return prompts.slice(0, 6);
}

function getCoachSectionStyle(viewportHeight, screenWidth, styles) {
  const reservedHeight = screenWidth <= 480 ? 300 : screenWidth <= 768 ? 250 : 220;
  const height = Math.max(360, viewportHeight - reservedHeight);

  return {
    ...styles.coachSection,
    height: `${height}px`,
    minHeight: `${height}px`,
    maxHeight: `${height}px`,
    overflow: "hidden",
    padding: screenWidth <= 480 ? "14px" : "18px",
    marginBottom: screenWidth <= 480 ? "0" : styles.section.marginBottom,
  };
}

function getCoachShellStyle(styles) {
  return {
    ...styles.coachShell,
    gap: "8px",
    minHeight: 0,
    overflow: "hidden",
  };
}

function getCoachActionsStyle(screenWidth, styles) {
  return {
    ...styles.sectionActions,
    gap: screenWidth <= 480 ? "6px" : "8px",
    flexWrap: "nowrap",
  };
}

function getQuickPromptRowStyle(screenWidth, styles) {
  return {
    ...styles.quickPromptRow,
    flexWrap: "nowrap",
    flexShrink: 0,
    overflowX: "auto",
    paddingBottom: "2px",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
    marginBottom: screenWidth <= 480 ? "2px" : 0,
  };
}

function getChatMessagesStyle(styles) {
  return {
    ...styles.chatMessages,
    flex: 1,
    minHeight: 0,
    maxHeight: "none",
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
  };
}

function getEmptyCoachStateStyle(screenWidth, styles) {
  return {
    ...styles.emptyCoachState,
    minHeight: screenWidth <= 480 ? "74px" : "96px",
  };
}

function getModalOverlayStyle() {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "rgba(15, 23, 42, 0.42)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    padding: "18px",
  };
}

function getCorrectionSheetStyle(styles) {
  return {
    ...styles.aiBubbleModern,
    width: "100%",
    maxWidth: "460px",
    borderRadius: "24px",
    border: "1px solid rgba(14, 165, 233, 0.25)",
    boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
  };
}

function getCorrectionOptionStyle(styles) {
  return {
    ...(styles.secondaryInlineBtn || styles.ghostBtn),
    width: "100%",
    justifyContent: "center",
    padding: "12px 14px",
  };
}

function getChatInputBarStyle(styles) {
  return {
    ...styles.chatInputBar,
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: "8px",
    padding: "8px 0 0",
    marginTop: 0,
    position: "relative",
    bottom: "auto",
    zIndex: 30,
  };
}

function getChatSendBtnStyle(styles) {
  return {
    ...styles.chatSendBtn,
    width: "auto",
    minWidth: "58px",
    flexShrink: 0,
    padding: "13px 14px",
    borderRadius: "999px",
  };
}
