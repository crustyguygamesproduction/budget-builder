import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const calendarPath = path.join(repoRoot, "src", "pages", "CalendarPage.jsx");

let source = fs.readFileSync(calendarPath, "utf8");
const original = source;

source = source.replace(
  "export default function CalendarPage({ transactions, transactionRules = [], moneyUnderstanding, onTransactionRulesChange, onRefreshMoneyUnderstanding, screenWidth, styles, helpers }) {",
  "export default function CalendarPage({ transactions, transactionRules = [], moneyUnderstanding, appMoneyModel, onTransactionRulesChange, onRefreshMoneyUnderstanding, screenWidth, styles, helpers }) {"
);

source = source.replace(
  "const recurringMonthTotal = recurringMonthEvents.reduce((sum, event) => sum + Math.abs(Number(event.amount || 0)), 0);",
  "const recurringMonthTotal = recurringMonthEvents.reduce((sum, event) => sum + Math.abs(Number(event.amount || 0)), 0);\n  const sharedBillMoney = Number(appMoneyModel?.monthlySharedContributionTotal || appMoneyModel?.sharedBillContributions?.monthlyTotal || 0);\n  const personalBillTotal = sharedBillMoney > 0 ? Math.max(Number(appMoneyModel?.monthlyBillBurdenTotal || 0) || recurringMonthTotal - sharedBillMoney, 0) : recurringMonthTotal;"
);

source = source.replace(
  '<MiniCard styles={styles} title="Bills this month" value={formatCurrency(recurringMonthTotal)} />',
  '<MiniCard styles={styles} title={sharedBillMoney > 0 ? "Bills to cover" : "Bills this month"} value={formatCurrency(personalBillTotal)} />\n            {sharedBillMoney > 0 ? <MiniCard styles={styles} title="Leaving account" value={formatCurrency(recurringMonthTotal)} /> : null}'
);

source = source.replace(
  "body={calendarAiText || (calendarMode === \"recurring\" ? recurringMonthEvents.length ? `Money Hub expects ${recurringMonthEvents.length} future bill/payment${recurringMonthEvents.length === 1 ? \"\" : \"s\"} this month, totalling about ${formatCurrency(recurringMonthTotal)}. Estimates improve as you add more months and answer Checks.` : \"No future bills found yet. Add more history or answer Checks when they appear.\" : patternSummary.body)}",
  "body={calendarAiText || (calendarMode === \"recurring\" ? recurringMonthEvents.length ? sharedBillMoney > 0 ? `Money Hub sees ${formatCurrency(personalBillTotal)} you need to cover this month. ${formatCurrency(recurringMonthTotal)} leaves the account before shared money is counted.` : `Money Hub expects ${recurringMonthEvents.length} future bill/payment${recurringMonthEvents.length === 1 ? \"\" : \"s\"} this month, totalling about ${formatCurrency(recurringMonthTotal)}. Estimates improve as you add more months and answer Checks.` : \"No future bills found yet. Add more history or answer Checks when they appear.\" : patternSummary.body)}"
);

if (source === original) {
  console.log("Calendar bill share patch already applied or source did not match");
} else {
  fs.writeFileSync(calendarPath, source);
  console.log("patched Calendar summary to show personal bills to cover when shared bill money exists");
}
