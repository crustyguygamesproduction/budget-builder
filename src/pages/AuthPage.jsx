import { Suspense, lazy, useState } from "react";
import { supabase } from "../supabase";
import { Notice } from "../components/ui";

const PrivacyPage = lazy(() => import("./PrivacyPage"));
const PRIVACY_POLICY_VERSION = "2026-05-03";

export default function AuthPage({ screenWidth, styles }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [notice, setNotice] = useState(null);

  function showNotice(message, tone = "bad", title = "") {
    setNotice({ message, tone, title });
  }

  function validateAuthInput(isSignup = false) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!agreedToPrivacy) {
      showNotice("Tick the privacy and data-use box before logging in or creating an account.");
      return null;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      showNotice("Type your email address in the normal format, like name@example.com.");
      return null;
    }

    if (isSignup && password.length < 10) {
      showNotice("Use at least 10 characters for your password. A longer password keeps your money data safer.");
      return null;
    }

    if (!password) {
      showNotice("Type your password first.");
      return null;
    }

    return { email: normalizedEmail, password };
  }

  async function login() {
    const credentials = validateAuthInput(false);
    if (!credentials || busy) return;

    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (!error && data?.user?.id) {
      await persistPrivacyConsent(data.user.id, credentials.email, buildConsentPayload());
    }
    setBusy(false);

    if (error) showNotice("Login did not work. Check your email and password, then try again.");
  }

  async function signup() {
    const credentials = validateAuthInput(true);
    if (!credentials || busy) return;

    const consentPayload = buildConsentPayload();

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      ...credentials,
      options: {
        data: consentPayload,
      },
    });

    if (error) {
      setBusy(false);
      showNotice("We could not create the account. Check the details and try again.");
      return;
    }

    if (data?.user?.id) {
      await persistPrivacyConsent(data.user.id, credentials.email, consentPayload);
    }

    setBusy(false);
    showNotice("Account created. You can now log in.", "good");
  }

  function buildConsentPayload() {
    const acceptedAt = new Date().toISOString();
    return {
      privacy_policy_version: PRIVACY_POLICY_VERSION,
      privacy_policy_accepted_at: acceptedAt,
      ai_processing_acknowledged_at: acceptedAt,
    };
  }

  async function persistPrivacyConsent(userId, normalizedEmail, consentPayload) {
    const { error } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email: normalizedEmail,
        privacy_policy_version: consentPayload.privacy_policy_version,
        privacy_policy_accepted_at: consentPayload.privacy_policy_accepted_at,
        ai_processing_acknowledged_at: consentPayload.ai_processing_acknowledged_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      console.warn("Privacy consent could not be saved to profiles", error);
    }
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
        <div style={getTrustGridStyle(screenWidth)}>
          <TrustPoint title="Private by design" body="Your financial data is for your money read, not ads." />
          <TrustPoint title="Plain-English help" body="Bills, spending and next steps without finance jargon." />
          <TrustPoint title="You stay in control" body="Replay setup, delete uploads, or wipe your data from Settings." />
        </div>
        <Notice notice={notice} styles={styles} onClose={() => setNotice(null)} />

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

          <div style={getConsentBoxStyle(agreedToPrivacy)}>
            <p style={styles.smallMuted}>
              Money Hub stores private financial data and uses it to build insights and AI answers.
            </p>
            <label style={{ ...styles.checkRow, marginTop: 8, marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={agreedToPrivacy}
                onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                required
              />
              <span>
                I agree to the{" "}
                <button type="button" style={styles.textLink || linkStyle} onClick={() => setShowPrivacy(true)}>
                  Privacy Policy
                </button>{" "}
                and the app's data-use terms.
              </span>
            </label>
          </div>

          <div style={getAuthButtonRowStyle(screenWidth)}>
            <button style={{ ...styles.primaryBtn, ...getDisabledAuthButtonStyle(busy || !agreedToPrivacy) }} type="submit" disabled={busy || !agreedToPrivacy}>
              {busy ? "Working..." : "Login"}
            </button>
            <button
              style={{ ...styles.secondaryBtn, ...getDisabledAuthButtonStyle(busy || !agreedToPrivacy) }}
              onClick={signup}
              type="button"
              disabled={busy || !agreedToPrivacy}
            >
              Create Account
            </button>
          </div>
        </form>

        {showPrivacy ? (
          <div style={{ marginTop: 18 }}>
            <Suspense fallback={<p style={styles.smallMuted}>Opening privacy...</p>}>
              <PrivacyPage onBack={() => setShowPrivacy(false)} styles={styles} />
            </Suspense>
          </div>
        ) : null}
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

function TrustPoint({ title, body }) {
  return (
    <div style={trustPointStyle}>
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function getHeroCardStyle(screenWidth, styles) {
  return {
    ...styles.heroCard,
    width: screenWidth <= 480 ? "calc(100vw - 40px)" : "min(720px, 100%)",
    maxWidth: "720px",
    minWidth: 0,
    padding: screenWidth <= 480 ? "20px" : "24px",
    borderRadius: screenWidth <= 480 ? "26px" : "32px",
  };
}

function getTrustGridStyle(screenWidth) {
  return {
    display: "grid",
    gridTemplateColumns: screenWidth <= 620 ? "1fr" : "repeat(3, minmax(0, 1fr))",
    gap: 8,
    margin: "0 0 16px",
  };
}

function getHeroTitleStyle(screenWidth, styles) {
  return {
    ...styles.heroTitle,
    fontSize: screenWidth <= 480 ? "32px" : screenWidth <= 768 ? "36px" : "40px",
  };
}

function getConsentBoxStyle(agreed) {
  return {
    marginTop: 10,
    marginBottom: 12,
    padding: 12,
    borderRadius: 18,
    border: agreed ? "1px solid #bbf7d0" : "1px solid #fecaca",
    background: agreed ? "#f0fdf4" : "#fff7f7",
  };
}

function getAuthButtonRowStyle(screenWidth) {
  return {
    display: "grid",
    gridTemplateColumns: screenWidth <= 520 ? "1fr" : "1fr 1fr",
    gap: 10,
    alignItems: "stretch",
  };
}

function getDisabledAuthButtonStyle(disabled) {
  return disabled
    ? {
        opacity: 0.52,
        cursor: "not-allowed",
      }
    : {};
}

const trustPointStyle = {
  display: "grid",
  gap: 5,
  padding: 12,
  borderRadius: 16,
  background: "#f8fbff",
  border: "1px solid #e2e8f0",
  color: "#0f172a",
  fontSize: 13,
  lineHeight: 1.4,
};
