import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src", "lib", "appMoneyModel.js");

let source = fs.readFileSync(modelPath, "utf8");
const original = source;

source = source.replace(
  'const recurringContributionKeys = recurringKeys(\n    transactions.filter((transaction) => Number(transaction.amount || 0) > 0 && Math.abs(Number(transaction.amount || 0)) >= 100)\n  );',
  'const recurringContributionKeys = recurringKeys(\n    transactions.filter((transaction) => Number(transaction.amount || 0) > 0 && Math.abs(Number(transaction.amount || 0)) >= 100),\n    contributionKey\n  );'
);

source = source.replace(
  'if (!isPossibleSharedBillContribution(transaction, recurringContributionKeys)) return map;\n    const key = transactionKey(transaction);',
  'if (!isPossibleSharedBillContribution(transaction, recurringContributionKeys)) return map;\n    const key = contributionKey(transaction);'
);

source = source.replace(
  'return recurringContributionKeys.has(transactionKey(transaction)) || SHARED_BILL_WORDS.test(text);',
  'return recurringContributionKeys.has(contributionKey(transaction)) || SHARED_BILL_WORDS.test(text);'
);

source = source.replace(
  'function recurringKeys(transactions) {\n  const groups = transactions.reduce((map, transaction) => {\n    const key = transactionKey(transaction);',
  'function recurringKeys(transactions, keyFn = transactionKey) {\n  const groups = transactions.reduce((map, transaction) => {\n    const key = keyFn(transaction);'
);

if (!source.includes("function contributionKey(transaction)")) {
  source = source.replace(
    'function transactionKey(transaction) {\n  const provider = getBillBaseName(transaction._real_merchant_name || transaction.description || "");\n  const amountBand = Math.round(Math.abs(Number(transaction.amount || 0)) / 10) * 10;\n  return provider ? `${provider}:${amountBand}` : "";\n}\n',
    'function transactionKey(transaction) {\n  const provider = getBillBaseName(transaction._real_merchant_name || transaction.description || "");\n  const amountBand = Math.round(Math.abs(Number(transaction.amount || 0)) / 10) * 10;\n  return provider ? `${provider}:${amountBand}` : "";\n}\n\nfunction contributionKey(transaction) {\n  const provider = getBillBaseName(transaction._real_merchant_name || transaction.description || "");\n  return provider ? `contribution:${provider}` : "";\n}\n'
  );
}

source = source.replace(
  'const confirmed = candidates\n    .filter((candidate) => ["high", "medium"].includes(candidate.confidence) && candidate.matchedBillName)\n    .sort((a, b) => b.monthlyAmount - a.monthlyAmount);',
  'const confirmed = candidates\n    .map(applySharedBillContributionCap)\n    .filter((candidate) => candidate.confidence === "high" && candidate.matchedBillName && candidate.appliedMonthlyAmount > 0)\n    .sort((a, b) => b.appliedMonthlyAmount - a.appliedMonthlyAmount);'
);

source = source.replace(
  'const needsChecking = candidates\n    .filter((candidate) => !confirmed.some((item) => item.key === candidate.key))\n    .filter((candidate) => candidate.confidence !== "low")\n    .slice(0, 5);',
  'const needsChecking = candidates\n    .map(applySharedBillContributionCap)\n    .filter((candidate) => !confirmed.some((item) => item.key === candidate.key))\n    .filter((candidate) => candidate.confidence !== "low")\n    .slice(0, 5);'
);

source = source.replace(
  'monthlyTotal: roundMoney(confirmed.reduce((sum, item) => sum + Number(item.monthlyAmount || 0), 0)),\n    label: confirmed.length\n      ? `${formatCurrency(confirmed.reduce((sum, item) => sum + Number(item.monthlyAmount || 0), 0))} shared bill contribution${confirmed.length === 1 ? "" : "s"}`',
  'monthlyTotal: roundMoney(confirmed.reduce((sum, item) => sum + Number(item.appliedMonthlyAmount || item.monthlyAmount || 0), 0)),\n    label: confirmed.length\n      ? `${formatCurrency(confirmed.reduce((sum, item) => sum + Number(item.appliedMonthlyAmount || item.monthlyAmount || 0), 0))} shared bill contribution${confirmed.length === 1 ? "" : "s"}`'
);

source = source.replace(
  'const monthlySharedContributionTotal = sharedBillContributions.confirmed.reduce(\n    (sum, contribution) => sum + Math.abs(Number(contribution.monthlyAmount || 0)),\n    0\n  );',
  'const monthlySharedContributionTotal = sharedBillContributions.confirmed.reduce(\n    (sum, contribution) => sum + Math.abs(Number(contribution.appliedMonthlyAmount || contribution.monthlyAmount || 0)),\n    0\n  );'
);

source = source.replace(
  'function getContributionConfidence({ group, match, monthWindow }) {',
  'function applySharedBillContributionCap(candidate) {\n  const billAmount = Math.abs(Number(candidate.matchedBillAmount || 0));\n  const monthlyAmount = Math.abs(Number(candidate.monthlyAmount || 0));\n  if (!billAmount || !monthlyAmount) return { ...candidate, appliedMonthlyAmount: monthlyAmount };\n  const ratio = monthlyAmount / billAmount;\n  const looksLikeHalfShare = Math.abs(ratio - 0.5) <= 0.15;\n  if (looksLikeHalfShare) {\n    const appliedMonthlyAmount = roundMoney(billAmount * 0.5);\n    const ignoredExtra = Math.max(monthlyAmount - appliedMonthlyAmount, 0);\n    return {\n      ...candidate,\n      appliedMonthlyAmount,\n      ignoredExtra: roundMoney(ignoredExtra),\n      helper: ignoredExtra > 10\n        ? `${formatCurrency(appliedMonthlyAmount)} looks like the regular shared bill amount. The extra ${formatCurrency(ignoredExtra)} is variable, so Money Hub will not rely on it.`\n        : candidate.helper,\n    };\n  }\n  if (ratio > 0.65) {\n    return {\n      ...candidate,\n      confidence: "needs_checking",\n      appliedMonthlyAmount: 0,\n      ignoredExtra: monthlyAmount,\n      helper: `${formatCurrency(monthlyAmount)} may include extra top-ups, so confirm this before Money Hub relies on it.`,\n    };\n  }\n  return { ...candidate, appliedMonthlyAmount: monthlyAmount };\n}\n\nfunction getContributionConfidence({ group, match, monthWindow }) {'
);

source = source.replace(
  'if (enoughHistory && closeHalf && nearBillDay) return "high";\n  if (enoughHistory && (closeHalf || nearBillDay || match.score >= 0.55)) return "medium";',
  'if (enoughHistory && closeHalf && nearBillDay) return "high";\n  if (enoughHistory && closeHalf && match.score >= 0.55) return "medium";'
);

if (source === original) {
  console.log("shared contribution hardening patch already applied or source did not match");
} else {
  fs.writeFileSync(modelPath, source);
  console.log("patched shared contribution grouping and capped variable shared bill money");
}
