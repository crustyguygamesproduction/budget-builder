import { normalizeText, parseAppDate, toIsoDate } from "./finance";

export function summariseRowsForImport(rows) {
  const validDates = rows
    .map((row) => parseAppDate(row.date))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (validDates.length === 0) {
    return { startDate: "", endDate: "", monthCount: 0, fullMonthCount: 0 };
  }

  const startDate = toIsoDate(validDates[0]);
  const endDate = toIsoDate(validDates[validDates.length - 1]);
  const monthGroups = new Map();
  validDates.forEach((date) => {
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    if (!monthGroups.has(key)) monthGroups.set(key, new Set());
    monthGroups.get(key).add(date.getDate());
  });
  const fullishMonths = [...monthGroups.entries()].filter(([key, days]) => {
    const [year, month] = key.split("-").map(Number);
    const monthLength = daysInMonth(year, month - 1);
    return days.size >= Math.min(20, monthLength - 4);
  });

  return {
    startDate,
    endDate,
    monthCount: monthGroups.size,
    fullMonthCount: fullishMonths.length,
  };
}

export function getImportFingerprint(fileName, rows) {
  const summary = summariseRowsForImport(rows);
  const head = rows.slice(0, 3).map((row) => `${row.date}|${row.description}|${row.amount}`).join("||");
  const tail = rows.slice(-3).map((row) => `${row.date}|${row.description}|${row.amount}`).join("||");
  return normalizeText(`${fileName}|${rows.length}|${summary.startDate}|${summary.endDate}|${head}|${tail}`);
}

export function getImportOverlapSummary(rows, existingTransactions) {
  if (!rows.length || !existingTransactions.length) {
    return { count: 0, ratio: 0 };
  }

  const existingKeys = new Set(
    existingTransactions.map((transaction) =>
      normalizeText(`${transaction.transaction_date}|${transaction.description}|${Number(transaction.amount || 0).toFixed(2)}`)
    )
  );

  const overlapCount = rows.filter((row) =>
    existingKeys.has(normalizeText(`${row.date}|${row.description}|${Number(row.amount || 0).toFixed(2)}`))
  ).length;

  return {
    count: overlapCount,
    ratio: rows.length ? overlapCount / rows.length : 0,
  };
}

export function getTransactionConfidence(row) {
  if (row.category === "Income" || row.category === "Bill" || row.category === "Subscription") {
    return 0.88;
  }
  if (row.category === "Internal Transfer") {
    return 0.84;
  }
  return 0.72;
}

export function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return "date range not obvious";
  if (startDate && endDate) return `${startDate} to ${endDate}`;
  return startDate || endDate;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}
