import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { buildCoachContext } from "../lib/coachContext";
import { getTotals } from "../lib/finance";
import { Section } from "../components/ui";

const COACH_DISPLAY_LIMIT = 18;
const COACH_DRAFT_KEY = "moneyhub-coach-draft";
const COACH_AUTOSEND_KEY = "moneyhub-coach-autosend";
const COACH_FRESH_CUTOFF_KEY = "moneyhub-coach-fresh-cutoff";

export default function CoachPage({
  transactions,
  goals,
  debts,
  investments,
  debtSignals,
  investmentSignals,
  aiMessages,
  subscriptionStatus,
  bankFeedReadiness,
  onChange,
  screenWidth,
  viewportHeight,
  styles,
  helpers,
}) {
  const [message, setMessage] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(COACH_DRAFT_KEY) || "";
  });
  const [thinking, setThinking] = useState(false);
  const [clearing, setClearing] = useState(false);
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

  const houseGoal =
    goals.find((goal) =>
      String(goal.name || "").toLowerCase().includes("house")
    ) || null;

  const baseMessages = freshCutoff
    ? aiMessages.filter(
        (msg) => !msg.created_at || msg.created_at >= freshCutoff
      )
    : aiMessages;

  const visibleMessages = baseMessages.slice(-COACH_DISPLAY_LIMIT);
  const hiddenCount = Math.max(baseMessages.length - visibleMessages.length, 0);
  const hiddenOlderByFreshView = Math.max(aiMessages.length - baseMessages.length, 0);
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
    if (thinking) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }
    latestMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [visibleMessages, thinking]);

  async function sendMessage(nextMessage) {
    const text = String(nextMessage ?? message).trim();
    if (!text || thinking) return;

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

      setMessage("");
      await onChange();
    } catch (error) {
      setChatError(error.message || "Something went wrong sending that message.");
    } finally {
      setThinking(false);
    }
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
    setChatError("");

    if (typeof window !== "undefined") {
      localStorage.setItem(COACH_FRESH_CUTOFF_KEY, cutoff);
    }
  }

  function showAllHistory() {
    setFreshCutoff("");
    setChatError("");

    if (typeof window !== "undefined") {
      localStorage.removeItem(COACH_FRESH_CUTOFF_KEY);
    }
  }

  return (
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
      <div style={styles.coachShell}>
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

        <div style={getChatMessagesStyle(viewportHeight, screenWidth, styles)}>
          {freshCutoff && hiddenOlderByFreshView > 0 && (
            <div style={styles.historyNote}>New chat. History is still saved.</div>
          )}

          {!freshCutoff && hiddenCount > 0 && (
            <div style={styles.historyNote}>Showing the latest messages.</div>
          )}

          {chatError && <div style={styles.errorNote}>{chatError}</div>}

          {visibleMessages.length === 0 ? (
            <div style={getEmptyCoachStateStyle(viewportHeight, screenWidth, styles)}>
              <p style={styles.emptyCoachTitle}>What do you want to check?</p>
              <p style={styles.emptyText}>
                Ask about bills, goals, spending, debt, or whether you can afford something.
              </p>
            </div>
          ) : (
            visibleMessages.map((msg, index) => (
              <div
                key={msg.id || `${msg.role}-${msg.created_at}-${index}`}
                ref={index === visibleMessages.length - 1 ? latestMessageRef : null}
              >
                <ChatMessage msg={msg} styles={styles} />
              </div>
            ))
          )}

          {thinking && (
            <div style={styles.aiBubbleModern}>
              <div style={styles.chatMetaRow}>
                <span style={styles.chatRoleLabel}>Money Hub</span>
                <span style={styles.chatTimeLabel}>now</span>
              </div>
              Thinking...
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        <div style={getChatInputBarStyle(screenWidth, styles)}>
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
            style={getChatSendBtnStyle(screenWidth, styles)}
            onClick={() => sendMessage()}
            disabled={thinking || !message.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </Section>
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
  const reservedHeight =
    screenWidth <= 480 ? 126 : screenWidth <= 768 ? 160 : 210;

  return {
    ...styles.coachSection,
    minHeight: `calc(${viewportHeight}px - ${reservedHeight}px)`,
    height: `calc(${viewportHeight}px - ${reservedHeight}px)`,
  };
}

function getCoachActionsStyle(screenWidth, styles) {
  return {
    ...styles.sectionActions,
    gap: screenWidth <= 480 ? "6px" : "8px",
  };
}

function getQuickPromptRowStyle(screenWidth, styles) {
  return {
    ...styles.quickPromptRow,
    flexWrap: "nowrap",
    overflowX: "auto",
    paddingBottom: "2px",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
    marginBottom: screenWidth <= 480 ? "2px" : 0,
  };
}

function getChatMessagesStyle(viewportHeight, screenWidth, styles) {
  let minHeight = 140;
  let maxHeight = Math.max(240, viewportHeight - 330);

  if (screenWidth <= 480) {
    minHeight = 128;
    maxHeight = Math.max(220, viewportHeight - 315);
  } else if (screenWidth <= 768) {
    minHeight = 160;
    maxHeight = Math.max(260, viewportHeight - 360);
  } else if (screenWidth <= 1100) {
    minHeight = 220;
    maxHeight = Math.max(300, viewportHeight - 400);
  }

  return {
    ...styles.chatMessages,
    minHeight: `${minHeight}px`,
    maxHeight: `${maxHeight}px`,
    flex: 1,
  };
}

function getEmptyCoachStateStyle(viewportHeight, screenWidth, styles) {
  let minHeight = Math.max(74, Math.min(118, viewportHeight * 0.12));

  if (screenWidth <= 480) {
    minHeight = Math.max(70, Math.min(104, viewportHeight * 0.1));
  }

  return {
    ...styles.emptyCoachState,
    minHeight: `${minHeight}px`,
  };
}

function getChatInputBarStyle(_screenWidth, styles) {
  return {
    ...styles.chatInputBar,
    flexDirection: "row",
    alignItems: "center",
    gap: "8px",
    padding: "10px 0 calc(96px + env(safe-area-inset-bottom))",
    marginTop: "auto",
    zIndex: 30,
  };
}

function getChatSendBtnStyle(_screenWidth, styles) {
  return {
    ...styles.chatSendBtn,
    width: "auto",
    minWidth: "58px",
    flexShrink: 0,
    padding: "13px 14px",
    borderRadius: "999px",
  };
}
