import SetupEmptyState from "../components/SetupEmptyState";
import DebtsPage from "./DebtsPage";

export default function DebtsPageUx(props) {
  const {
    debts = [],
    debtSignals = [],
    transactions = [],
    documents = [],
    styles,
    viewerMode,
  } = props;

  const hasSavedDebts = debts.length > 0;
  const hasSignals = debtSignals.length > 0;
  const hasDocuments = documents.length > 0;
  const hasUsefulHistory = transactions.length > 0;

  if (hasSavedDebts || hasSignals || hasDocuments) {
    return <DebtsPage {...props} />;
  }

  return (
    <>
      <SetupEmptyState
        styles={styles}
        title="Debt Tracker"
        label="Optional setup"
        headline="No debts found yet, so there is nothing scary to show."
        body="If you have a credit card, loan, finance agreement or overdraft, add it once and Money Hub can track payments, minimums and whether you are falling behind. If you do not have debt, this page can stay quiet."
        primaryAction={{
          label: hasUsefulHistory ? "Use AI setup below" : "Upload statements first",
          onClick: () => {
            const target = document.getElementById("debt-setup-form");
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
          },
        }}
        secondaryAction={viewerMode ? null : {
          label: "Upload debt document",
          onClick: () => {
            const target = document.getElementById("debt-document-upload");
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
          },
        }}
        cards={[
          {
            label: "What counts?",
            headline: "Credit cards, loans, finance, overdrafts",
            body: "Do not add normal bills here. Rent, energy and phone bills belong in Calendar and Checks.",
          },
          {
            label: "Why add it?",
            headline: "The app can protect repayments",
            body: "Once set up, Money Hub can tell whether payments are being made and whether spare money should go to debt first.",
          },
          {
            label: "Not sure?",
            headline: "Let statements find signals",
            body: "Upload a few months of statements. If the app sees debt-like payments, it will suggest them here.",
          },
        ]}
      />
      <div id="debt-setup-form">
        <DebtsPage {...props} />
      </div>
    </>
  );
}
