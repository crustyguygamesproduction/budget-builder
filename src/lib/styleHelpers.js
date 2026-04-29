import { styles } from "../styles";

export function getMainStyle(screenWidth, page) {
  return {
    ...styles.main,
    padding:
      screenWidth <= 480
        ? "0 12px"
        : screenWidth <= 768
        ? "0 14px"
        : "0 16px",
    paddingBottom: page === "coach" ? "18px" : undefined,
  };
}

export function getGridStyle(screenWidth) {
  return {
    ...styles.grid,
    gridTemplateColumns: screenWidth <= 480 ? "1fr" : "1fr 1fr",
  };
}

export function getStatusPillStyle(tone) {
  const map = {
    good: {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #bbf7d0",
    },
    warn: {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fde68a",
    },
    bad: {
      background: "#fee2e2",
      color: "#991b1b",
      border: "1px solid #fecaca",
    },
    neutral: {
      background: "#e2e8f0",
      color: "#334155",
      border: "1px solid #cbd5e1",
    },
    income: {
      background: "#dbeafe",
      color: "#1d4ed8",
      border: "1px solid #bfdbfe",
    },
    bill: {
      background: "#fee2e2",
      color: "#991b1b",
      border: "1px solid #fecaca",
    },
    subscription: {
      background: "#ede9fe",
      color: "#5b21b6",
      border: "1px solid #ddd6fe",
    },
  };

  return {
    ...styles.statusPill,
    ...(map[tone] || map.neutral),
  };
}

export function getHomeStatusPillStyle(tone) {
  const map = {
    good: {
      background: "rgba(220, 252, 231, 0.95)",
      color: "#14532d",
      border: "1px solid rgba(187, 247, 208, 0.95)",
    },
    warn: {
      background: "rgba(254, 243, 199, 0.96)",
      color: "#78350f",
      border: "1px solid rgba(253, 230, 138, 0.95)",
    },
    bad: {
      background: "rgba(254, 226, 226, 0.96)",
      color: "#7f1d1d",
      border: "1px solid rgba(254, 202, 202, 0.95)",
    },
    neutral: {
      background: "rgba(255, 255, 255, 0.18)",
      color: "white",
      border: "1px solid rgba(255,255,255,0.28)",
    },
  };

  return {
    ...styles.pulseTag,
    ...(map[tone] || map.neutral),
  };
}

export function getCalendarEventStyle(kind) {
  return {
    ...styles.calendarEvent,
    ...(kind === "income"
      ? styles.calendarEventIncome
      : kind === "subscription"
      ? styles.calendarEventSubscription
      : styles.calendarEventBill),
  };
}
