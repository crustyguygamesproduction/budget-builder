import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  completeOnboarding,
  hasCompletedOnboarding,
  ONBOARDING_REPLAY_EVENT,
} from "./onboardingState";
import "./onboarding.css";

const PHASES = {
  WELCOME: "welcome",
  UPLOAD: "upload",
  CALENDAR: "calendar",
  COACH: "coach",
  DONE: "done",
};

const FLOW = [
  PHASES.WELCOME,
  PHASES.UPLOAD,
  PHASES.CALENDAR,
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
        <p>Quick setup</p>
        <strong>See the next bill first.</strong>
      </div>
      <div className="mh-ob-mini-list">
        <span><b /> Dump in CSVs</span>
        <span><b /> Bills appear in Calendar</span>
        <span><b /> Goals get suggested</span>
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
      eyebrow: "2 minute setup",
      title: hasData ? "Let's turn this into a plan." : "Dump statements in. Get a money read.",
      body: "No budgeting homework. Upload CSVs, Money Hub finds bills and suggests the first sensible goal.",
      bullets: ["Multiple CSVs are fine", "Duplicates get checked", "You can redo this from More"],
      primary: hasData ? "Show my next step" : "Start with upload",
      secondary: "Skip for now",
    },
    [PHASES.UPLOAD]: {
      eyebrow: "Big win first",
      title: "Upload enough to find the next bill.",
      body: "A few months is best. The reward is quick: Home and Calendar start showing what needs covering.",
      bullets: ["CSV only for now", "Old months are useful", "No manual sorting"],
      primary: hasData ? "I've uploaded" : "Go to Upload",
      page: "upload",
    },
    [PHASES.CALENDAR]: {
      eyebrow: "One quick check",
      title: "Calendar is where bills become real.",
      body: "Confirm rent, bills, subs and debt payments. Mark nonsense as not a bill. That fixes Home, Goals and AI together.",
      bullets: ["Bills found", "Missing bills", "Not a bill"],
      primary: "Open Calendar",
      page: "calendar",
    },
    [PHASES.COACH]: {
      eyebrow: "Then let it help",
      title: "Goals and AI do the thinking.",
      body: "Goals suggests realistic safety pots. AI can explain today's spending in plain English.",
      bullets: ["Smart goal suggestions", "7-day plan", "No fake optimism"],
      primary: "Open AI Coach",
      page: "coach",
    },
    [PHASES.DONE]: {
      eyebrow: "That's it",
      title: "The rhythm is simple.",
      body: "Upload. Check Calendar. Pick one goal. Ask AI when stuck.",
      bullets: ["Redo from More", "Delete data anytime", "Paid bank linking later"],
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
