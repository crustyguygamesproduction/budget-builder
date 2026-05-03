import { supabase } from "../supabase";

export default function TopBar({ email, title, page, returnTarget, onBack, screenWidth, styles }) {
  async function logout() {
    await supabase.auth.signOut();
  }

  return (
    <header style={getTopBarStyle(screenWidth, styles)}>
      <div style={styles.topBarText}>
        <p style={styles.kicker}>Money Hub</p>
        <div style={getTitleRowStyle()}>
          {returnTarget ? (
            <button
              type="button"
              style={getBackButtonStyle()}
              onClick={onBack}
              aria-label={`Back to ${returnTarget.label}`}
              title={`Back to ${returnTarget.label}`}
            >
              ←
            </button>
          ) : null}
          <h2 style={getTopTitleStyle(screenWidth, styles)}>{title}</h2>
        </div>
        <p style={styles.topEmail}>
          {page === "coach"
            ? "Ask for a plain-English money plan"
            : page === "confidence"
            ? "Things Money Hub needs you to confirm"
            : page === "debts"
            ? "Repay safely after bills"
            : page === "investments"
            ? "Grow money only when bills are safe"
            : page === "calendar"
            ? "Bills, rent, subscriptions and spending"
            : page === "settings"
            ? "Setup, privacy and your data"
            : email}
        </p>
      </div>

      <button style={styles.logoutBtn} onClick={logout}>
        Logout
      </button>
    </header>
  );
}

function getTitleRowStyle() {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  };
}

function getBackButtonStyle() {
  return {
    width: 36,
    height: 36,
    borderRadius: 999,
    border: "1px solid rgba(148, 163, 184, 0.28)",
    background: "rgba(255, 255, 255, 0.92)",
    color: "#0f172a",
    display: "inline-grid",
    placeItems: "center",
    fontSize: 20,
    fontWeight: 900,
    cursor: "pointer",
    flex: "0 0 auto",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.10)",
  };
}

function getTopBarStyle(screenWidth, styles) {
  return {
    ...styles.topBar,
    padding: screenWidth <= 480 ? "12px 12px 10px" : "16px 16px 12px",
  };
}

function getTopTitleStyle(screenWidth, styles) {
  return {
    ...styles.topTitle,
    fontSize: screenWidth <= 480 ? "22px" : screenWidth <= 768 ? "26px" : "30px",
  };
}
