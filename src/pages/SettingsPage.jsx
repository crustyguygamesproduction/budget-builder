import { useState } from "react";
import { supabase } from "../supabase";
import { Row, Section } from "../components/ui";
import { replayOnboarding } from "../components/onboarding/onboardingState";
import { BANK_FEED_PROVIDER } from "../lib/bankFeeds";
import { FREE_FEATURES, PREMIUM_FEATURES, getPremiumFeatureSummary } from "../lib/productPlan";

export default function SettingsPage({
  userId,
  viewerAccess,
  onViewerChange,
  viewerMode,
  setViewerMode,
  financialDocuments,
  subscriptionStatus,
  bankFeedReadiness,
  bankConnections,
  onShowPrivacy,
  styles,
}) {
  const [viewerEmail, setViewerEmail] = useState("");
  const [viewerLabel, setViewerLabel] = useState("");
  const [sharing, setSharing] = useState(false);

  async function addViewer() {
    if (!viewerEmail.trim()) return;

    setSharing(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("viewer_access").insert({
        user_id: user.id,
        viewer_email: viewerEmail.trim().toLowerCase(),
        label: viewerLabel.trim() || null,
        role: "viewer",
        invite_status: "pending",
      });

      if (error) throw error;

      setViewerEmail("");
      setViewerLabel("");
      await onViewerChange();
      alert("Viewer added. Once the other person has an account, this can become a proper shared read-only view.");
    } catch (error) {
      alert(error.message || "Could not add viewer yet.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <Section title="Plan And Premium" styles={styles}>
        <p style={styles.sectionIntro}>{getPremiumFeatureSummary(subscriptionStatus).body}</p>
        <Row name="Current plan" value={subscriptionStatus?.label || "Free"} styles={styles} />
        <Row name="Paid hook" value="Automatic bank sync and smarter warnings" styles={styles} />
        <Row name="Payment path" value="Stripe subscription table ready" styles={styles} />
        <div style={styles.compactInsightGrid}>
          <FeatureList title="Free" features={FREE_FEATURES} styles={styles} />
          <FeatureList title="Premium" features={PREMIUM_FEATURES} styles={styles} />
        </div>
      </Section>

      <Section title="Live Bank Feed Prep" styles={styles}>
        <p style={styles.sectionIntro}>{bankFeedReadiness.body}</p>
        <Row name="Recommended provider" value={BANK_FEED_PROVIDER.name} styles={styles} />
        <Row name="Why this first" value="Lowest-cost UK AIS path" styles={styles} />
        <Row name="Connected banks" value={`${bankConnections.length}`} styles={styles} />
        <Row name="Active feeds" value={`${bankFeedReadiness.activeCount || 0}`} styles={styles} />
        <Row name="Fallbacks" value={BANK_FEED_PROVIDER.fallbackProviders.join(", ")} styles={styles} />
        <button style={styles.primaryBtn} type="button" disabled>
          Bank connection coming in Premium
        </button>
      </Section>

      <Section title="Family / Viewer Mode" styles={styles}>
        <p style={styles.sectionIntro}>
          Shared viewer mode is now wired in as a read-only access layer.
          Use it for parents, partner, or anyone who should see progress without editing anything.
        </p>

        <label style={styles.checkRow}>
          <input
            type="checkbox"
            checked={viewerMode}
            onChange={(e) => setViewerMode(e.target.checked)}
          />
          <span>Preview the app in viewer mode</span>
        </label>

        <input
          style={styles.input}
          placeholder="Viewer email"
          value={viewerEmail}
          onChange={(e) => setViewerEmail(e.target.value)}
        />
        <input
          style={styles.input}
          placeholder="Label, e.g. Mum or Partner"
          value={viewerLabel}
          onChange={(e) => setViewerLabel(e.target.value)}
        />
        <button style={styles.primaryBtn} onClick={addViewer} disabled={sharing}>
          {sharing ? "Adding..." : "Add Viewer"}
        </button>
      </Section>

      <Section title="Current Viewer Access" styles={styles}>
        {viewerAccess.length === 0 ? (
          <p style={styles.emptyText}>No viewers added yet.</p>
        ) : (
          viewerAccess.map((item) => (
            <Row
              key={item.id}
              name={`${item.label || item.viewer_email} (${item.role || "viewer"})`}
              value={item.invite_status || "pending"}
              styles={styles}
            />
          ))
        )}
      </Section>

      <Section title="Documents And Extraction" styles={styles}>
        <Row name="Saved finance documents" value={`${financialDocuments.length}`} styles={styles} />
        <Row name="Image extraction" value="Live" styles={styles} />
        <Row name="PDF storage" value="Live" styles={styles} />
      </Section>

      <Section title="Help And Tips" styles={styles}>
        <p style={styles.sectionIntro}>
          Quick fintech-style pointers for getting clean answers from Money Hub. Tips appear once per login account and can be skipped.
        </p>
        <Row name="Best first upload" value="Oldest statements first" styles={styles} />
        <Row name="If a number looks odd" value="Ask AI why" styles={styles} />
        <Row name="Before saving goals" value="Check estimates" styles={styles} />
        <button style={styles.ghostBtn} type="button" onClick={() => replayOnboarding(userId)}>
          Replay setup tips
        </button>
        <button style={styles.ghostBtn} type="button" onClick={onShowPrivacy}>
          Privacy
        </button>
      </Section>

      <Section title="Product Direction" styles={styles}>
        <Row name="Statement-first setup" value="Core" styles={styles} />
        <Row name="Bulk multi-statement upload" value="Live" styles={styles} />
        <Row name="Recurring payment inference" value="Live" styles={styles} />
        <Row name="Debt/investment smart tracking" value="Premium" styles={styles} />
        <Row name="Live market pricing" value="Premium" styles={styles} />
        <Row name="Viewer mode" value="Premium" styles={styles} />
        <Row name="Live bank feeds" value="Premium prep" styles={styles} />
      </Section>
    </>
  );
}

function FeatureList({ title, features, styles }) {
  return (
    <div style={styles.insightCard}>
      <p style={styles.insightLabel}>{title}</p>
      {features.map((feature) => (
        <Row key={feature} name={feature} value="Included" styles={styles} />
      ))}
    </div>
  );
}
