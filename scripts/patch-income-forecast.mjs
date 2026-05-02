import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src", "lib", "appMoneyModel.js");

let source = fs.readFileSync(modelPath, "utf8");
const original = source;

const oldFunctionStart = 'function getUpcomingIncome(incomeTransactions = [], incomeConfidence = "low") {';
const oldFunctionIndex = source.indexOf(oldFunctionStart);
const nextFunctionIndex = source.indexOf('\nfunction cleanIncomeName(transaction)', oldFunctionIndex);

if (oldFunctionIndex >= 0 && nextFunctionIndex > oldFunctionIndex && !source.includes('function detectIncomeCadence')) {
  const newFunction = `function getUpcomingIncome(incomeTransactions = [], incomeConfidence = "low") {
  if (incomeConfidence === "low" || !incomeTransactions.length) {
    return {
      amount: 0,
      count: 0,
      items: [],
      confidence: "low",
      label: "Income not clear yet",
      helper: "Upload more history or confirm income before Money Hub predicts money coming in.",
      periodLabel: "next 30 days",
    };
  }

  const groups = incomeTransactions.reduce((map, transaction) => {
    const amount = Math.abs(Number(transaction.amount || 0));
    const date = parseAppDate(transaction.transaction_date);
    if (!amount || !date) return map;
    const key = incomeProviderKey(transaction);
    if (!key) return map;
    if (!map.has(key)) {
      map.set(key, { key, name: cleanIncomeName(transaction), amounts: [], dates: [], monthKeys: new Set() });
    }
    const group = map.get(key);
    group.amounts.push(amount);
    group.dates.push(date);
    group.monthKeys.add(monthKey(date));
    return map;
  }, new Map());

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizonDays = 30;
  const items = [...groups.values()]
    .filter((group) => group.monthKeys.size >= 1)
    .flatMap((group) => forecastIncomeGroup(group, today, horizonDays))
    .filter((item) => item.amount > 0 && item.daysAway <= horizonDays)
    .sort((a, b) => a.daysAway - b.daysAway || b.amount - a.amount);

  const amount = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
  const cadenceSummary = summariseIncomeCadences(items);
  return {
    amount,
    count: items.length,
    items,
    confidence: items.length ? incomeConfidence : "low",
    label: items.length ? formatCurrency(amount) : "No expected income found",
    periodLabel: "next 30 days",
    helper: items.length
      ? `${formatCurrency(amount)} expected over the next 30 days${cadenceSummary ? ` from ${cadenceSummary}` : ""}. Dates can move if pay lands late.`
      : "Income history exists, but the next date is not clear yet.",
  };
}

function incomeProviderKey(transaction) {
  const provider = getBillBaseName(transaction._real_merchant_name || transaction.description || "");
  return provider ? `income:${provider}` : "";
}

function forecastIncomeGroup(group, today, horizonDays) {
  const sortedDates = group.dates.slice().sort((a, b) => a - b);
  const cadence = detectIncomeCadence(sortedDates);
  const amount = roundMoney(usualAmount(group.amounts));
  if (!amount || !cadence.days) return [];

  const lastDate = sortedDates[sortedDates.length - 1];
  const forecast = [];
  let next = new Date(lastDate);
  next.setHours(0, 0, 0, 0);
  let safety = 0;

  while (next < today && safety < 20) {
    next = addCalendarDays(next, cadence.days);
    safety += 1;
  }

  while (safety < 40) {
    const daysAway = Math.round((next - today) / 86400000);
    if (daysAway > horizonDays) break;
    if (daysAway >= 0) {
      forecast.push({
        key: `${group.key}:${toIsoDate(next)}`,
        providerKey: group.key,
        name: group.name,
        amount,
        date: toIsoDate(next),
        daysAway,
        cadence: cadence.label,
        confidence: cadence.confidence,
      });
    }
    next = addCalendarDays(next, cadence.days);
    safety += 1;
  }

  return forecast;
}

function detectIncomeCadence(dates = []) {
  if (dates.length < 2) {
    return { days: 30, label: "monthly income", confidence: "low" };
  }
  const gaps = [];
  for (let index = 1; index < dates.length; index += 1) {
    const gap = Math.round((dates[index] - dates[index - 1]) / 86400000);
    if (gap >= 5 && gap <= 45) gaps.push(gap);
  }
  if (!gaps.length) return { days: 30, label: "monthly income", confidence: "low" };
  const median = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (median >= 5 && median <= 9) return { days: 7, label: "weekly income", confidence: "high" };
  if (median >= 12 && median <= 16) return { days: 14, label: "fortnightly income", confidence: "medium" };
  if (median >= 26 && median <= 35) return { days: 30, label: "monthly income", confidence: "medium" };
  return { days: Math.max(7, Math.min(median, 30)), label: "regular income", confidence: "low" };
}

function addCalendarDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days || 0));
  next.setHours(0, 0, 0, 0);
  return next;
}

function summariseIncomeCadences(items = []) {
  const cadences = [...new Set(items.map((item) => item.cadence).filter(Boolean))];
  if (!cadences.length) return "regular income";
  return cadences.slice(0, 2).join(" and ");
}

`;
  source = `${source.slice(0, oldFunctionIndex)}${newFunction}${source.slice(nextFunctionIndex + 1)}`;
}

if (source === original) {
  console.log("income forecast patch already applied or source did not match");
} else {
  fs.writeFileSync(modelPath, source);
  console.log("patched income forecast to support weekly, fortnightly and monthly income over next 30 days");
}
