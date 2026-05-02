import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src", "lib", "appMoneyModel.js");

let source = fs.readFileSync(modelPath, "utf8");
const original = source;

source = source.replace(
  `const recurringContributionKeys = recurringKeys(\n    transactions.filter((transaction) => Number(transaction.amount || 0) > 0 && Math.abs(Number(transaction.amount || 0)) >= 100)\n  );`,
  `const recurringContributionKeys = recurringKeys(\n    transactions.filter((transaction) => Number(transaction.amount || 0) > 0 && Math.abs(Number(transaction.amount || 0)) >= 100),\n    contributionKey\n  );`
);

source = source.replace(
  `function getSharedBillContributions({ transactions = [], calendarBills = [], monthWindow }) {\n  const recurringContributionKeys`,
  `function getSharedBillContributions({ transactions = [], calendarBills = [], monthWindow }) {\n  const recurringContributionKeys`
);

source = source.replace(
  `if (!isPossibleSharedBillContribution(transaction, recurringContributionKeys)) return map;\n    const key = transactionKey(transaction);`,
  `if (!isPossibleSharedBillContribution(transaction, recurringContributionKeys)) return map;\n    const key = contributionKey(transaction);`
);

source = source.replace(
  `return recurringContributionKeys.has(transactionKey(transaction)) || SHARED_BILL_WORDS.test(text);`,
  `return recurringContributionKeys.has(contributionKey(transaction)) || SHARED_BILL_WORDS.test(text);`
);

source = source.replace(
  `function recurringKeys(transactions) {\n  const groups = transactions.reduce((map, transaction) => {\n    const key = transactionKey(transaction);`,
  `function recurringKeys(transactions, keyFn = transactionKey) {\n  const groups = transactions.reduce((map, transaction) => {\n    const key = keyFn(transaction);`
);

if (!source.includes("function contributionKey(transaction)")) {
  source = source.replace(
    `function transactionKey(transaction) {\n  const provider = getBillBaseName(transaction._real_merchant_name || transaction.description || "");\n  const amountBand = Math.round(Math.abs(Number(transaction.amount || 0)) / 10) * 10;\n  return provider ? \`${provider}:${amountBand}\` : "";\n}\n`,
    `function transactionKey(transaction) {\n  const provider = getBillBaseName(transaction._real_merchant_name || transaction.description || "");\n  const amountBand = Math.round(Math.abs(Number(transaction.amount || 0)) / 10) * 10;\n  return provider ? \`${provider}:${amountBand}\` : "";\n}\n\nfunction contributionKey(transaction) {\n  const provider = getBillBaseName(transaction._real_merchant_name || transaction.description || "");\n  return provider ? \`contribution:${provider}\` : "";\n}\n`
  );
}

if (source === original) {
  console.log("shared contribution grouping patch already applied or source did not match");
} else {
  fs.writeFileSync(modelPath, source);
  console.log("patched shared contribution grouping to use provider-only recurring keys");
}
