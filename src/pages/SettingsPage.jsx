import { useState } from "react";
import { supabase } from "../supabase";
import { Row, Section } from "../components/ui";

export default function SettingsPage({
  viewerAccess,
  onViewerChange,
  viewerMode,
  setViewerMode,
  financialDocuments,
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

      <Section title="Product Direction" styles={styles}>
        <Row name="Statement-first setup" value="Core" styles={styles} />
        <Row name="Bulk multi-statement upload" value="Live" styles={styles} />
        <Row name="Recurring payment inference" value="Live" styles={styles} />
        <Row name="Debt/investment smart tracking" value="Live" styles={styles} />
        <Row name="Live market pricing" value="Live" styles={styles} />
        <Row name="Viewer mode" value="Live" styles={styles} />
      </Section>
    </>
  );
}
