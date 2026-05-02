import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  completeOnboarding,
  hasCompletedOnboarding,
  ONBOARDING_REPLAY_EVENT,
} from "./onboardingState";
import "./onboarding.css";

const PHASES = {
  WELCOME: "welcome",
  ACCOUNT: "account",
  UPLOAD: "upload",
  CALENDAR: "calendar",
  GOALS: "goals",
  COACH: "coach",
  DONE: "done",
};

const FLOW = [
  PHASES.WELCOME,
  PHASES.ACCOUNT,
  PHASES.UPLOAD,
  PHASES.CALENDAR,
  PHASES.GOALS,
  PHASES.COACH,
  PHASES.DONE,
];

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

function MoneyPathPreview() {
  return (
    <div className="mh-ob-phone" aria-hidden="true">
      <div className="mh-ob-phone-top">
        <span />
        <span />
      </div>
      <div className="mh-ob-balance-card">
        <p>Money Hub setup</p>
        <strong>Upload. Check. Plan.</strong>
      </div>
      <div className="mh-ob-mini-list">
        <span><b /> CSV statements sorted</span>
        <span><b /> Bills, rent and subs checked</span>
        <span><b /> Goals and AI plan next</span>
      </div>
      <p style={{ marginTop: 10, fontSize: 13, opacity: 0.7 }}>
        Built for people who want help, not homework.
      </p>
    </div>
  );
}

export default function OnboardingExperience({
  setPage,
  userId,
  screenWidth = 1024,
  transactionCount = 0,
}) {
  const [isOpen, setIsOpen] = useState(() => !hasCompletedOnboarding(userId));
  const [phase, setPhase] = useState(PHASES.WELCOME);
  const dialogRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const compact = screenWidth < 680;
  const hasData = transactionCount > 0;
  const stepIndex = FLOW.indexOf(phase);

  const close = useCallback((nextPage = null) => {
    completeOnboarding(userId);
    if (nextPage) setPage(nextPage);
    window.setTimeout(() => setIsOpen(false), 50);
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

  const content = useMemo(() => ({
    [PHASES.WELCOME]: {
      eyebrow: "First setup",
      title: hasData ? "Let's make your money easier to read." : "Install it, sign in, dump in statements.",
      body: "Money Hub is for people who want help, not homework. Add it to your phone if you want, upload CSVs, and let it sort the mess before asking you to check anything.",
      bullets: ["Add to phone from your browser", "No spreadsheets to maintain", "Bulk uploads are fine"],
      primary: "Show me the flow",
      secondary: "Skip for now",
    },
    [PHASES.ACCOUNT]: {
      eyebrow: "Step 1",
      title: "Create your account once.",
      body: "You are already signed in now. New users do this first so their statements, goals and AI history stay private to them.",
      bullets: ["Email login", "Private user data", "Replay setup anytime from More"],
      primary: "Next: upload statements",
    },
    [PHASES.UPLOAD]: {
      eyebrow: "Step 2",
      title: "Dump in your bank statements.",
      body: "CSV files are the easy mode. You can upload multiple files, old months first or all at once. Money Hub checks overlap and avoids putting the same transaction in twice.",
      bullets: ["CSV format", "Multiple statements are fine", "Duplicates are checked before import"],
      primary: "Go to Upload",
      page: "upload",
    },
    [PHASES.CALENDAR]: {
      eyebrow: "Step 3",
      title: "Use Calendar to check bills, rent and subscriptions.",
      body: "Calendar is where Money Hub shows bills it found, possible missing bills, hidden suggestions, and past spending. You confirm the big recurring stuff so the rest of the app stops guessing.",
      bullets: ["Rent, bills, subs and debt payments", "Mark things as not bills", "Restore hidden suggestions if needed"],
      primary: "Open Calendar",
      page: "calendar",
    },
    [PHASES.GOALS]: {
      eyebrow: "Step 4",
      title: "Set one goal: safety first, growth second.",
      body: "Start with a safety buffer. Once that exists, move toward growth: debt freedom, investing, a move, a house, or whatever matters.",
      bullets: ["Recommended safety goal", "Safe monthly amount", "No fake optimism"],
      primary: "Open Goals",
      page: "goals",
    },
    [PHASES.COACH]: {
      eyebrow: "Step 5",
      title: "Ask AI what your money pattern looks like.",
      body: "The coach uses the organised money layer, Calendar bills, Checks and goals. Ask for a plain-English overview, a spending personality read, or a 7-day plan.",
      bullets: ["Helpful, direct advice", "Uses your real app data", "Good for lazy check-ins"],
      primary: "Open AI Coach",
      page: "coach",
    },
    [PHASES.DONE]: {
      eyebrow: "You're ready",
      title: "Money Hub now has a simple rhythm.",
      body: "Upload statements, check Calendar, set one goal, then ask AI. In the paid future, live bank feeds can replace the upload chore.",
      bullets: ["Redo this from More", "Delete your data anytime", "Delete single months if an upload was wrong"],
      primary: "Start on Home",
      page: "today",
    },
  }), [hasData]);

  if (!isOpen) return null;

  const current = content[phase];
  const canBack = stepIndex > 0;
  const canNext = phase !== PHASES.DONE;

  function next() {
    if (phase === PHASES.DONE) {
      close(current.page || "today");
      return;
    }
    setPhase(FLOW[Math.min(stepIndex + 1, FLOW.length - 1)]);
  }

  function back() {
    setPhase(FLOW[Math.max(stepIndex - 1, 0)]);
  }

  function goToPage() {
    close(current.page || "today");
  }

  return (
    <div className={`mh-ob-root ${reducedMotion ? "mh-ob-reduced" : ""}`} role="presentation">
      <div className="mh-ob-veil" />

      <section
        ref={dialogRef}
        className={`mh-ob-dialog mh-ob-dialog-${phase}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mh-ob-title"
        tabIndex={-1}
      >
        <button className="mh-ob-close" type="button" onClick={() => close()} aria-label="Skip setup">
          x
        </button>

        <div className="mh-ob-copy">
          <div className="mh-ob-progress" aria-hidden="true">
            {FLOW.slice(0, -1).map((item, index) => (
              <span key={item} className={index < stepIndex ? "done" : index === stepIndex ? "active" : ""} />
            ))}
          </div>

          <p className="mh-ob-eyebrow">{current.eyebrow}</p>
          <h2 id="mh-ob-title">{current.title}</h2>
          <p className="mh-ob-body">{current.body}</p>

          <div className="mh-ob-proof-list">
            {current.bullets.map((item) => <span key={item}>{item}</span>)}
          </div>

          <div className="mh-ob-actions">
            {current.page ? (
              <button className="mh-ob-primary" type="button" onClick={goToPage}>
                {current.primary}
              </button>
            ) : (
              <button className="mh-ob-primary" type="button" onClick={next}>
                {current.primary}
              </button>
            )}
            {canNext ? (
              <button className="mh-ob-secondary" type="button" onClick={next}>
                Next
              </button>
            ) : null}
            {canBack ? (
              <button className="mh-ob-secondary" type="button" onClick={back}>
                Back
              </button>
            ) : (
              <button className="mh-ob-secondary" type="button" onClick={() => close()}>
                {current.secondary || "Skip"}
              </button>
            )}
          </div>
        </div>

        {!compact ? <MoneyPathPreview /> : null}
      </section>
    </div>
  );
}
