export function Section({ title, children, right, sectionStyle, styles }) {
  return (
    <section style={{ ...styles.section, ...sectionStyle }}>
      <div style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>{title}</h3>
        {right ? right : null}
      </div>
      {children}
    </section>
  );
}

export function MiniCard({ title, value, styles }) {
  return (
    <div style={styles.miniCard}>
      <p style={styles.cardLabel}>{title}</p>
      <h4 style={styles.cardValue}>{value}</h4>
    </div>
  );
}

export function Row({ name, value, styles }) {
  return (
    <div style={styles.row}>
      <span>{name}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function InsightCard({ label, headline, body, onClick, ctaLabel, styles }) {
  const cardStyle = onClick ? { ...styles.insightCard, ...styles.insightCardInteractive } : styles.insightCard;

  return (
    <button type="button" style={cardStyle} onClick={onClick} disabled={!onClick}>
      <p style={styles.insightLabel}>{label}</p>
      <h4 style={styles.insightHeadline}>{headline}</h4>
      <p style={styles.insightBody}>{body}</p>
      {ctaLabel ? <span style={styles.insightCta}>{ctaLabel}</span> : null}
    </button>
  );
}

export function ActionCard({ label, headline, body, actionLabel, onClick, styles }) {
  return (
    <button type="button" style={styles.actionCard} onClick={onClick}>
      <p style={styles.insightLabel}>{label}</p>
      <h4 style={styles.insightHeadline}>{headline}</h4>
      <p style={styles.insightBody}>{body}</p>
      <span style={styles.insightCta}>{actionLabel}</span>
    </button>
  );
}
