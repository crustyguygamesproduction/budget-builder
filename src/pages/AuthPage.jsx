import { useState } from "react";
import { supabase } from "../supabase";

export default function AuthPage({ screenWidth, styles, onShowPrivacy }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);

  function validateAuthInput(isSignup = false) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      alert("Enter a valid email address.");
      return null;
    }

    if (isSignup && password.length < 10) {
      alert("Use at least 10 characters for your password.");
      return null;
    }

    if (!password) {
      alert("Enter your password.");
      return null;
    }

    return { email: normalizedEmail, password };
  }

  async function login() {
    const credentials = validateAuthInput(false);
    if (!credentials || busy) return;

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(credentials);
    setBusy(false);

    if (error) alert("Login did not work. Check your email and password, then try again.");
  }

  async function signup() {
    const credentials = validateAuthInput(true);
    if (!credentials || busy) return;

    if (!agreedToPrivacy) {
      alert("Please agree to the Privacy Policy before creating an account.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signUp(credentials);
    setBusy(false);

    if (error) {
      alert("Account creation did not work. Check the details and try again.");
      return;
    }

    alert("Account created. You can now log in.");
  }

  return (
    <div style={styles.authWrap}>
      <section style={getHeroCardStyle(screenWidth, styles)}>
        <div style={styles.authBadgeRow}>
          <span style={styles.authBadge}>Money Hub</span>
          <span style={styles.authMuted}>Budget Builder</span>
        </div>

        <h1 style={getHeroTitleStyle(screenWidth, styles)}>Money that builds itself.</h1>
        <p style={styles.subText}>
          Upload statements, let the app do the hard bit, and get a cleaner
          money setup without spreadsheet energy.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            login();
          }}
        >
          <input
            style={styles.input}
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          <input
            style={styles.input}
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <button style={styles.primaryBtn} type="submit" disabled={busy}>
            {busy ? "Working..." : "Login"}
          </button>
        </form>

        <label style={{ ...styles.checkRow, marginTop: 14, marginBottom: 10 }}>
  <input
    type="checkbox"
    checked={agreedToPrivacy}
    onChange={(e) => setAgreedToPrivacy(e.target.checked)}
  />
          <span>
            I agree to the{" "}
            <button type="button" style={styles.textLink || linkStyle} onClick={onShowPrivacy}>
              Privacy Policy
            </button>{" "}
            and understand my data is processed to provide insights and AI features.
          </span>
</label>

<button
  style={styles.secondaryBtn}
  onClick={signup}
  type="button"
  disabled={busy || !agreedToPrivacy}
>
  Create Account
</button>
      </section>
    </div>
  );
}

const linkStyle = {
  border: 0,
  background: "transparent",
  color: "#1d4ed8",
  padding: 0,
  font: "inherit",
  textDecoration: "underline",
  cursor: "pointer",
};

function getHeroCardStyle(screenWidth, styles) {
  return {
    ...styles.heroCard,
    padding: screenWidth <= 480 ? "20px" : "24px",
    borderRadius: screenWidth <= 480 ? "26px" : "32px",
  };
}

function getHeroTitleStyle(screenWidth, styles) {
  return {
    ...styles.heroTitle,
    fontSize: screenWidth <= 480 ? "32px" : screenWidth <= 768 ? "36px" : "40px",
  };
}
