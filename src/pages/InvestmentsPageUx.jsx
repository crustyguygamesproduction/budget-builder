import SetupEmptyState from "../components/SetupEmptyState";
import InvestmentsPage from "./InvestmentsPage";
import { getInvestmentSignals } from "../lib/statementSignals";

export default function InvestmentsPageUx(props) {
  const {
    investments = [],
    investmentSignals: providedInvestmentSignals,
    transactions = [],
    documents = [],
    styles,
    viewerMode,
  } = props;
  const investmentSignals = providedInvestmentSignals || getInvestmentSignals(transactions);

  const hasSavedInvestments = investments.length > 0;
  const hasSignals = investmentSignals.length > 0;
  const hasDocuments = documents.length > 0;
  const hasUsefulHistory = transactions.length > 0;

  if (hasSavedInvestments || hasSignals || hasDocuments) {
    return <InvestmentsPage {...props} />;
  }

  return (
    <>
      <SetupEmptyState
        styles={styles}
        title="Investment Tracker"
        label="Optional setup"
        headline="No investments found yet. That is fine."
        body="If you invest through an ISA, pension, crypto wallet or broker, add it once so Money Hub can separate investment contributions from normal spending. If you do not invest yet, this page should stay simple, not make you feel behind."
        primaryAction={{
          label: hasUsefulHistory ? "Use AI setup below" : "Upload statements first",
          onClick: () => {
            const target = document.getElementById("investment-setup-form");
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
          },
        }}
        secondaryAction={viewerMode ? null : {
          label: "Upload investment screenshot",
          onClick: () => {
            const target = document.getElementById("investment-document-upload");
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
          },
        }}
        cards={[
          {
            label: "Important",
            headline: "Deposits are not current value",
            body: "Money sent to Vanguard, Trading 212 or crypto is a cash flow. Add a value or document before treating it as what you own now.",
          },
          {
            label: "Why add it?",
            headline: "It makes net worth less fake",
            body: "Savings, debts and investments need to be separated so the app does not confuse investing with spending.",
          },
          {
            label: "Easy start",
            headline: "A screenshot is enough",
            body: "A broker screenshot or simple description lets AI fill the first draft, then you can check it before saving.",
          },
        ]}
      />
      <div id="investment-setup-form">
        <InvestmentsPage {...props} />
      </div>
    </>
  );
}
