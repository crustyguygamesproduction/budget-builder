import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  completeOnboarding,
  hasCompletedOnboarding,
  ONBOARDING_REPLAY_EVENT,
} from "./onboardingState";
import "./onboarding.css";

const PHASES = {
  WELCOME: "welcome",
  CHOOSE: "choose",
  UPLOAD: "upload",
  BANK: "bank",
  EXPLORE: "explore",
};

const DEFAULT_ANCHORS = {
  today: ["[data-page='today']", "[data-nav='today']", "button[aria-label*='Today']", "button"],
  upload: ["[data-page='upload']", "[data-nav='upload']", "button[aria-label*='Upload']"],
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(media.matches);
    onChange();
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}

function findAnchor(selectors = []) {
  if (typeof document === "undefined") return null;
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function getSpotlightRect(phase) {
  const key = phase === PHASES.UPLOAD ? "upload" : phase === PHASES.EXPLORE ? "today" : null;
  if (!key) return null;
  const el = findAnchor(DEFAULT_ANCHORS[key]);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;
  return {
    top: Math.max(12, rect.top - 10),
    left: Math.max(12, rect.left - 10),
    width: Math.min(window.innerWidth - 24, rect.width + 20),
    height: Math.min(window.innerHeight - 24, rect.height + 20),
  };
}

function Sparkline() {
  return (
    <svg className="mh-ob-sparkline" viewBox="0 0 240 90" role="img" aria-label="Simple spending trend preview">
      <defs>
        <linearGradient id="mh-ob-line" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <path d="M8 70 C38 54 52 62 76 42 C104 18 124 40 148 28 C178 12 196 36 232 18" fill="none" stroke="url(#mh-ob-line)" strokeWidth="8" strokeLinecap="round" />
      <path d="M8 70 C38 54 52 62 76 42 C104 18 124 40 148 28 C178 12 196 36 232 18 L232 90 L8 90 Z" fill="url(#mh-ob-line)" opacity="0.12" />
    </svg>
  );
}

function MiniDashboard({ hasData }) {
  return (
    <div className="mh-ob-phone" aria-hidden="true">
      <div className="mh-ob-phone-top">
        <span />
        <span />
      </div>
      <div className="mh-ob-balance-card">
        <p>{hasData ? "Ready to analyse" : "Your money, sorted"}</p>
        <strong>{hasData ? "Dashboard ready" : "Start with 1 file"}</strong>
      </div>
      <Sparkline />
      <div className="mh-ob-mini-list">
        <span><b /> Food insight</span>
        <span><b /> Bills detected</span>
        <span><b /> Coach ready</span>
      </div>
    </div>
  );
}

export default function OnboardingExperience({
  setPage,
  userId,
  screenWidth = 1024,
  transactionCount = 0,
  accountCount = 0,
}) {
  const [isOpen, setIsOpen] = useState(() => !hasCompletedOnboarding(userId));
  const [phase, setPhase] = useState(PHASES.WELCOME);
  const [spotlight, setSpotlight] = useState(null);
  const dialogRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const compact = screenWidth < 680;
  const hasData = transactionCount > 0 || accountCount > 0;

  const close = useCallback((nextPage = null) => {
    completeOnboarding(userId);

    if (nextPage === "upload" && typeof window !== "undefined") {
      sessionStorage.setItem("moneyhub-highlight-upload", "true");
    }

    if (nextPage) {
      setPage(nextPage);
    }

    setTimeout(() => {
      setIsOpen(false);
    }, 50);
  }, [setPage, userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsOpen(!hasCompletedOnboarding(userId));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [userId]);

  useEffect(() => {
    function handleReplay() {
      setPhase(PHASES.WELCOME);
      setIsOpen(true);
    }

    window.addEventListener(ONBOARDING_REPLAY_EVENT, handleReplay);
    return () => window.removeEventListener(ONBOARDING_REPLAY_EVENT, handleReplay);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 40);

    function onKeyDown(event) {
      if (event.key === "Escape") close();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const updateSpotlight = () => setSpotlight(getSpotlightRect(phase));
    updateSpotlight();
    window.addEventListener("resize", updateSpotlight);
    window.addEventListener("scroll", updateSpotlight, true);
    return () => {
      window.removeEventListener("resize", updateSpotlight);
      window.removeEventListener("scroll", updateSpotlight, true);
    };
  }, [phase, isOpen]);

  const content = useMemo(() => ({
    [PHASES.WELCOME]: {
      eyebrow: "Money Hub setup",
      title: hasData ? "You're nearly there." : "Sort your money without the boring setup.",
      body: hasData
        ? "We'll show the fastest route through the app, then get out of your way."
        : "No long tour. Choose one action and get to a useful money view quickly.",
      primary: "Start setup",
      secondary: "Skip tips",
    },
    [PHASES.CHOOSE]: {
      eyebrow: "Pick your first win",
      title: "What do you want to do first?",
      body: "The best onboarding is the one that helps you actually do something. Choose the route that fits right now.",
    },
    [PHASES.UPLOAD]: {
      eyebrow: "Fastest value",
      title: "Upload one statement. We'll turn it into insight.",
      body: "The app reads your file, spots patterns, categorises spending and makes the dashboard useful immediately.",
      primary: "Go to upload",
      secondary: "Choose another route",
      proof: ["Review before import", "Works before live bank feeds", "Great for testing the product"],
    },
    [PHASES.BANK]: {
      eyebrow: "Coming soon",
      title: "Live bank linking belongs here, but only after the backend is ready.",
      body: "This will become your Plaid, TrueLayer or Yapily consent flow. For now, we keep the button visible but honest.",
      primary: "Use statements for now",
      secondary: "Choose another route",
      proof: ["Secure consent flow", "Server-side token storage", "No bank secrets in the browser"],
    },
    [PHASES.EXPLORE]: {
      eyebrow: "No pressure",
      title: "Explore the app first. Add data when you're ready.",
      body: "You can look around without being trapped in setup. We'll keep a small nudge to upload when useful.",
      primary: "Explore Today",
      secondary: "Choose another route",
      proof: ["No forced setup", "Replay anytime in More", "Useful prompts stay subtle"],
    },
  }), [hasData]);

  if (!isOpen) return null;

  function goToPhase(nextPhase, page = null) {
    if (page) setPage(page);
    setPhase(nextPhase);
  }

  const current = content[phase];
  const showSplit = phase === PHASES.WELCOME || (!compact && phase === PHASES.CHOOSE);

  return (
    <div className={`mh-ob-root ${reducedMotion ? "mh-ob-reduced" : ""}`} role="presentation">
      <div className="mh-ob-veil" />
      {spotlight && <div className="mh-ob-spotlight" style={spotlight} aria-hidden="true" />}

      <section
        ref={dialogRef}
        className={`mh-ob-dialog mh-ob-dialog-${phase}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mh-ob-title"
        tabIndex={-1}
      >
        <button className="mh-ob-close" type="button" onClick={() => close()} aria-label="Skip onboarding">
          x
        </button>

        <div className="mh-ob-copy">
          <div className="mh-ob-progress" aria-hidden="true">
            <span className={phase === PHASES.WELCOME ? "active" : "done"} />
            <span className={phase === PHASES.CHOOSE ? "active" : [PHASES.UPLOAD, PHASES.BANK, PHASES.EXPLORE].includes(phase) ? "done" : ""} />
            <span className={[PHASES.UPLOAD, PHASES.BANK, PHASES.EXPLORE].includes(phase) ? "active" : ""} />
          </div>

          <p className="mh-ob-eyebrow">{current.eyebrow}</p>
          <h2 id="mh-ob-title">{current.title}</h2>
          <p className="mh-ob-body">{current.body}</p>

          {phase === PHASES.WELCOME && (
            <div className="mh-ob-tip-strip" aria-label="Quick setup tips">
              <span>Upload statements oldest to newest</span>
              <span>Check guessed accounts before saving</span>
              <span>Ask AI why when a number looks off</span>
            </div>
          )}

          {phase === PHASES.WELCOME && (
            <div className="mh-ob-actions">
              <button className="mh-ob-primary" type="button" onClick={() => setPhase(PHASES.CHOOSE)}>
                {current.primary}
              </button>
              <button className="mh-ob-secondary" type="button" onClick={() => close()}>
                {current.secondary}
              </button>
            </div>
          )}

          {phase === PHASES.CHOOSE && (
            <div className="mh-ob-options">
              <button className="mh-ob-option mh-ob-option-featured" type="button" onClick={() => close("upload")}>
                <span className="mh-ob-icon">1</span>
                <strong>Upload statement</strong>
                <em>Fastest way to see real insight.</em>
                <small>Recommended</small>
              </button>
              <button className="mh-ob-option" type="button" onClick={() => goToPhase(PHASES.BANK)}>
                <span className="mh-ob-icon">2</span>
                <strong>Connect bank</strong>
                <em>Open Banking slot, coming soon.</em>
              </button>
              <button className="mh-ob-option" type="button" onClick={() => close("today")}>
                <span className="mh-ob-icon">3</span>
                <strong>Just explore</strong>
                <em>No pressure. Add data later.</em>
              </button>
            </div>
          )}

          {[PHASES.UPLOAD, PHASES.BANK, PHASES.EXPLORE].includes(phase) && (
            <>
              <div className="mh-ob-proof-list">
                {current.proof.map((item) => <span key={item}>{item}</span>)}
              </div>
              <div className="mh-ob-actions">
                <button
                  className="mh-ob-primary"
                  type="button"
                  onClick={() => {
                    if (phase === PHASES.EXPLORE) close("today");
                    else close("upload");
                  }}
                >
                  {current.primary}
                </button>
                <button className="mh-ob-secondary" type="button" onClick={() => setPhase(PHASES.CHOOSE)}>
                  {current.secondary}
                </button>
              </div>
            </>
          )}
        </div>

        {showSplit && <MiniDashboard hasData={hasData} />}
      </section>
    </div>
  );
}
