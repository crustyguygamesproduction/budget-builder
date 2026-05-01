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

  const quickPrompts = helpers.getCoachPromptIdeas({
    topCategories,
    houseGoal,
    debtSignals,
    investmentSignals,
  });

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
      title="AI Money Coach"
      sectionStyle={getCoachSectionStyle(viewportHeight, screenWidth, styles)}
      styles={styles}
      right={
        <div style={styles.sectionActions}>
          <button
            style={styles.ghostBtn}
            onClick={freshCutoff ? showAllHistory : startFreshView}
            disabled={thinking}
          >
            {freshCutoff ? "Show history" : "Fresh chat"}
          </button>

          <button
            style={styles.ghostBtn}
            onClick={clearChat}
            disabled={clearing || aiMessages.length === 0}
          >
            {clearing ? "Clearing..." : "Clear chat"}
          </button>
        </div>
      }
    >
      <div style={styles.coachShell}>
        <div style={styles.coachStatusCard}>
          <div>
            <p style={styles.insightLabel}>Coach status</p>
            <h4 style={styles.coachStatusTitle}>
              {thinking ? "Thinking through it now" : "Ready for a money sanity check"}
            </h4>
            <p style={styles.insightBody}>
              {freshCutoff
                ? "Fresh session view is on. Older messages are hidden by default, not deleted."
                : "Short answers first, practical actions next, no fake numbers."}
            </p>
          </div>
        </div>

        <div style={getQuickPromptRowStyle(screenWidth, styles)}>
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              style={styles.promptChip}
              onClick={() => sendMessage(prompt)}
              disabled={thinking}
            >
              {prompt}
            </button>
          ))}
        </div>

        <div style={getChatMessagesStyle(viewportHeight, screenWidth, styles)}>
          {freshCutoff && hiddenOlderByFreshView > 0 && (
            <div style={styles.historyNote}>
              Fresh chat view is hiding {hiddenOlderByFreshView} older message
              {hiddenOlderByFreshView === 1 ? "" : "s"}.
            </div>
          )}

          {!freshCutoff && hiddenCount > 0 && (
            <div style={styles.historyNote}>
              Showing latest {visibleMessages.length} messages. Older chat is
              hidden to keep things tidy.
            </div>
          )}

          {chatError && <div style={styles.errorNote}>{chatError}</div>}

          {visibleMessages.length === 0 ? (
            <div style={getEmptyCoachStateStyle(viewportHeight, screenWidth, styles)}>
              <p style={styles.emptyCoachTitle}>Ask me anything about your money.</p>
              <p style={styles.emptyText}>
                Try spending checks, debt questions, investing sanity checks, or
                asking whether you are getting better or worse over time.
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
                <span style={styles.chatRoleLabel}>AI Coach</span>
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
            placeholder="Ask about your money..."
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
        <span style={styles.chatRoleLabel}>{isUser ? "You" : "AI Coach"}</span>
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

function getCoachSectionStyle(viewportHeight, screenWidth, styles) {
  const reservedHeight =
    screenWidth <= 480 ? 150 : screenWidth <= 768 ? 180 : 220;

  return {
    ...styles.coachSection,
    minHeight: `calc(${viewportHeight}px - ${reservedHeight}px)`,
    height: `calc(${viewportHeight}px - ${reservedHeight}px)`,
  };
}

function getQuickPromptRowStyle(screenWidth, styles) {
  return {
    ...styles.quickPromptRow,
    flexWrap: screenWidth <= 768 ? "wrap" : "nowrap",
    overflowX: screenWidth > 768 ? "auto" : "visible",
  };
}

function getChatMessagesStyle(viewportHeight, screenWidth, styles) {
  let minHeight = 180;
  let maxHeight = Math.max(220, viewportHeight - 420);

  if (screenWidth <= 480) {
    minHeight = 160;
    maxHeight = Math.max(200, viewportHeight - 400);
  } else if (screenWidth <= 768) {
    minHeight = 180;
    maxHeight = Math.max(240, viewportHeight - 430);
  } else if (screenWidth <= 1100) {
    minHeight = 220;
    maxHeight = Math.max(260, viewportHeight - 440);
  }

  return {
    ...styles.chatMessages,
    minHeight: `${minHeight}px`,
    maxHeight: `${maxHeight}px`,
    flex: 1,
  };
}

function getEmptyCoachStateStyle(viewportHeight, screenWidth, styles) {
  let minHeight = Math.max(100, Math.min(180, viewportHeight * 0.18));

  if (screenWidth <= 480) {
    minHeight = Math.max(90, Math.min(140, viewportHeight * 0.14));
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
