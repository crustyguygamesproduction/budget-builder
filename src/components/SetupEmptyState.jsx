import { InsightCard, Section } from "./ui";

export default function SetupEmptyState({
  title,
  label = "Set up",
  headline,
  body,
  primaryAction,
  secondaryAction,
  cards = [],
  styles,
}) {
  return (
    <Section styles={styles} title={title}>
      <div style={getHeroStyle()}>
        <p style={styles.insightLabel}>{label}</p>
        <h3 style={getHeadlineStyle()}>{headline}</h3>
        <p style={getBodyStyle()}>{body}</p>
        <div style={styles.inlineBtnRow}>
          {primaryAction ? (
            <button type="button" style={styles.primaryInlineBtn} onClick={primaryAction.onClick}>
              {primaryAction.label}
            </button>
          ) : null}
          {secondaryAction ? (
            <button type="button" style={styles.secondaryInlineBtn || styles.ghostBtn} onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      </div>

      {cards.length > 0 ? (
        <div style={{ ...styles.compactInsightGrid, marginTop: 12 }}>
          {cards.map((card) => (
            <InsightCard
              key={card.label}
              label={card.label}
              headline={card.headline}
              body={card.body}
              ctaLabel={card.ctaLabel}
              onClick={card.onClick}
              styles={styles}
            />
          ))}
        </div>
      ) : null}
    </Section>
  );
}

function getHeroStyle() {
  return {
    border: "1px solid rgba(148, 163, 184, 0.28)",
    borderRadius: 22,
    padding: 18,
    background: "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(248,250,252,0.9))",
    boxShadow: "0 18px 45px rgba(15, 23, 42, 0.06)",
  };
}

function getHeadlineStyle() {
  return {
    margin: "4px 0 8px",
    fontSize: 22,
    lineHeight: 1.12,
    letterSpacing: 0,
  };
}

function getBodyStyle() {
  return {
    margin: 0,
    color: "#64748b",
    lineHeight: 1.5,
    maxWidth: 720,
  };
}
