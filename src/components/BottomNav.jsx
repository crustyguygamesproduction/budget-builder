import { useState } from "react";

const PRIMARY_ITEMS = [
  { key: "today", label: "Home", icon: "home" },
  { key: "calendar", label: "Calendar", icon: "calendar" },
  { key: "upload", label: "Upload", icon: "upload", primary: true },
  { key: "goals", label: "Goals", icon: "target" },
  { key: "coach", label: "AI", icon: "spark" },
];

const MORE_ITEMS = [
  { key: "confidence", label: "Review", hint: "Things to confirm" },
  { key: "debts", label: "Debts", hint: "Cards and loans" },
  { key: "investments", label: "Invest", hint: "Keep bills safe first" },
  { key: "receipts", label: "Receipts", hint: "Proof and refunds" },
  { key: "settings", label: "Settings", hint: "Setup and privacy" },
];

export default function BottomNav({ page, setPage, screenWidth, styles }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const pageInMore = MORE_ITEMS.some((item) => item.key === page);

  function go(nextPage) {
    setPage(nextPage);
    setMoreOpen(false);
  }

  return (
    <>
      {moreOpen ? (
        <div style={getMorePanelStyle(screenWidth)}>
          <div style={getMoreHeaderStyle()}>
            <strong>More</strong>
            <button type="button" style={getCloseButtonStyle()} onClick={() => setMoreOpen(false)}>Close</button>
          </div>
          <div style={getMoreGridStyle()}>
            {MORE_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                style={getMoreItemStyle(page === item.key)}
                onClick={() => go(item.key)}
              >
                <strong>{item.label}</strong>
                <span>{item.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <nav style={getNavStyle(screenWidth, styles)} aria-label="Main navigation">
        {PRIMARY_ITEMS.map((item) => {
          const isActive = page === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => go(item.key)}
              style={getNavButtonStyle({ active: isActive, primary: item.primary })}
              aria-current={isActive ? "page" : undefined}
            >
              <span style={getIconWrapStyle({ active: isActive, primary: item.primary })}>
                <NavIcon name={item.icon} />
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          style={getNavButtonStyle({ active: pageInMore || moreOpen })}
          aria-expanded={moreOpen}
        >
          <span style={getIconWrapStyle({ active: pageInMore || moreOpen })}>
            <NavIcon name="more" />
          </span>
          <span>More</span>
        </button>
      </nav>
    </>
  );
}

function NavIcon({ name }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  if (name === "home") return <svg {...common}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M9.5 20v-6h5v6" /></svg>;
  if (name === "calendar") return <svg {...common}><path d="M7 3v4" /><path d="M17 3v4" /><path d="M4 8h16" /><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 12h3" /><path d="M13 12h3" /><path d="M8 16h3" /></svg>;
  if (name === "upload") return <svg {...common}><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></svg>;
  if (name === "target") return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></svg>;
  if (name === "spark") return <svg {...common}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg>;
  return <svg {...common}><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
}

function getNavStyle(screenWidth, styles) {
  return {
    ...styles.nav,
    left: screenWidth <= 480 ? "10px" : "50%",
    right: screenWidth <= 480 ? "10px" : "auto",
    transform: screenWidth <= 480 ? "none" : "translateX(-50%)",
    bottom: screenWidth <= 480 ? "10px" : "14px",
    maxWidth: "720px",
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    gap: "6px",
    padding: "8px",
    borderRadius: "26px",
    background: "rgba(255, 255, 255, 0.92)",
    border: "1px solid rgba(148, 163, 184, 0.24)",
    boxShadow: "0 18px 50px rgba(15, 23, 42, 0.16)",
  };
}

function getNavButtonStyle({ active, primary = false }) {
  return {
    border: 0,
    background: active ? "#0f172a" : primary ? "#2563eb" : "transparent",
    color: active || primary ? "white" : "#64748b",
    borderRadius: primary ? "20px" : "18px",
    padding: primary ? "9px 7px" : "8px 6px",
    minHeight: "58px",
    display: "grid",
    placeItems: "center",
    gap: "3px",
    fontSize: "11px",
    fontWeight: 850,
    cursor: "pointer",
    boxShadow: primary ? "0 10px 26px rgba(37, 99, 235, 0.28)" : "none",
  };
}

function getIconWrapStyle({ active, primary = false }) {
  return {
    width: 24,
    height: 24,
    display: "grid",
    placeItems: "center",
    color: active || primary ? "white" : "#475569",
  };
}

function getMorePanelStyle(screenWidth) {
  return {
    position: "fixed",
    left: screenWidth <= 480 ? "10px" : "50%",
    right: screenWidth <= 480 ? "10px" : "auto",
    transform: screenWidth <= 480 ? "none" : "translateX(-50%)",
    bottom: screenWidth <= 480 ? "86px" : "92px",
    zIndex: 50,
    width: screenWidth <= 480 ? "auto" : "680px",
    maxWidth: "calc(100vw - 20px)",
    padding: 14,
    borderRadius: 24,
    background: "rgba(255, 255, 255, 0.96)",
    border: "1px solid rgba(148, 163, 184, 0.24)",
    boxShadow: "0 22px 70px rgba(15, 23, 42, 0.22)",
    backdropFilter: "blur(18px)",
  };
}

function getMoreHeaderStyle() {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  };
}

function getCloseButtonStyle() {
  return {
    border: 0,
    borderRadius: 999,
    padding: "8px 10px",
    background: "#e2e8f0",
    color: "#0f172a",
    fontWeight: 800,
  };
}

function getMoreGridStyle() {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(138px, 1fr))",
    gap: 8,
  };
}

function getMoreItemStyle(active) {
  return {
    display: "grid",
    gap: 3,
    textAlign: "left",
    border: active ? "1px solid rgba(37, 99, 235, 0.35)" : "1px solid rgba(148, 163, 184, 0.2)",
    background: active ? "#eff6ff" : "#f8fafc",
    color: "#0f172a",
    borderRadius: 16,
    padding: 12,
    cursor: "pointer",
  };
}
