import { Row, Section } from "../components/ui";

export default function PrivacyPage({ onBack, styles }) {
  return (
    <>
      <section style={styles.balanceCard}>
        <div style={styles.balanceTopRow}>
          <p style={styles.smallWhite}>Privacy</p>
          {onBack ? (
            <button type="button" style={styles.ghostLightBtn || styles.ghostBtn} onClick={onBack}>
              Back
            </button>
          ) : null}
        </div>
        <h1 style={{ ...styles.bigMoney, fontSize: 38 }}>Your money data stays yours.</h1>
        <p style={styles.balanceSubcopy}>
          Money Hub is built for private financial decisions, not advertising profiles.
        </p>
      </section>

      <Section title="What You Share" styles={styles}>
        <p style={styles.sectionIntro}>
          You may add bank statement CSVs, receipts, financial documents, goals, debts, investments, and notes you type into the AI coach.
          Only add information you are comfortable using inside Money Hub.
        </p>
        <Row name="Statements" value="Used to build spending, income, calendar, and trend reads" styles={styles} />
        <Row name="Receipts and documents" value="Stored privately for matching and extraction" styles={styles} />
        <Row name="AI chat" value="Used to answer your money questions with context" styles={styles} />
      </Section>

      <Section title="How AI Uses Context" styles={styles}>
        <p style={styles.sectionIntro}>
          The AI coach receives selected financial context so it can answer specific questions. We keep that context focused on what is useful,
          such as recent transactions, category totals, recurring payments, debts, investments, and your current question.
        </p>
        <Row name="No fake certainty" value="AI should explain what it can and cannot see" styles={styles} />
        <Row name="Sensitive by default" value="Financial context is treated as private app data" styles={styles} />
      </Section>

      <Section title="What We Do Not Do" styles={styles}>
        <Row name="Sell your data" value="No" styles={styles} />
        <Row name="Use bank data for ads" value="No" styles={styles} />
        <Row name="Make hidden payments" value="No" styles={styles} />
      </Section>

      <Section title="Security Principles" styles={styles}>
        <p style={styles.sectionIntro}>
          Money Hub uses Supabase authentication, row-level database policies, private storage, and short-lived signed links for sensitive files.
          Live bank feed tokens should stay server-side when bank sync is enabled.
        </p>
        <Row name="Access control" value="Users can only read their own records" styles={styles} />
        <Row name="File storage" value="Private bucket, signed access links" styles={styles} />
        <Row name="Control" value="You choose what to upload and save" styles={styles} />
      </Section>

      <Section title="Support" styles={styles}>
        <p style={styles.sectionIntro}>
          For now, use the support route provided with the app or contact the Money Hub owner directly. A dedicated support address should be added before public launch.
        </p>
      </Section>
    </>
  );
}
