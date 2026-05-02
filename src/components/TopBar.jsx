import { supabase } from "../supabase";

export default function TopBar({ email, title, page, screenWidth, styles }) {
  async function logout() {
    await supabase.auth.signOut();
  }

  return (
    <header style={getTopBarStyle(screenWidth, styles)}>
      <div style={styles.topBarText}>
        <p style={styles.kicker}>Money Hub</p>
        <h2 style={getTopTitleStyle(screenWidth, styles)}>{title}</h2>
        <p style={styles.topEmail}>
          {page === "coach"
            ? "Ask for a plain-English money plan"
            : page === "confidence"
            ? "Quick checks that make the app smarter"
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
