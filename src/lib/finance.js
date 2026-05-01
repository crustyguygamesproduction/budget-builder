export function getTotals(transactions) {
  const income = transactions
    .filter((transaction) => Number(transaction.amount) > 0 && !isInternalTransferLike(transaction))
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

  const spending = transactions
    .filter((transaction) => Number(transaction.amount) < 0 && !isInternalTransferLike(transaction))
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);

  const bills = transactions
    .filter((transaction) => transaction._smart_is_bill || transaction.is_bill || transaction._smart_is_subscription || transaction.is_subscription)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);

  return { income, spending, bills, net: income - spending, safeToSpend: 0 };
}

export function getMeaningfulCategory(transaction) {
  return transaction?._smart_category || transaction?.category || (Number(transaction?.amount || 0) > 0 ? "Income" : "Spending");
}

export function isInternalTransferLike(transaction) {
  return Boolean(transaction?._smart_internal_transfer || transaction?.is_internal_transfer);
}

export function dayDifference(a, b) {
  const first = new Date(a);
  const second = new Date(b);
  if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) return 999;
  return Math.round((first - second) / 86400000);
}

export function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseAppDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();

  const isoMatch = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return buildDate(year, month, day);
  }

  const compactMatch = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, year, month, day] = compactMatch;
    return buildDate(year, month, day);
  }

  const slashMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    let [, first, second, year] = slashMatch;
    const firstNum = Number(first);
    const secondNum = Number(second);
    const yearNum = year.length === 2 ? 2000 + Number(year) : Number(year);

    if (firstNum > 12 && secondNum <= 12) return buildDate(yearNum, secondNum, firstNum);
    if (secondNum > 12 && firstNum <= 12) return buildDate(yearNum, firstNum, secondNum);
    return buildDate(yearNum, secondNum, firstNum);
  }

  const monthNameMatch = normalized.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/);
  if (monthNameMatch) {
    const [, day, monthName, year] = monthNameMatch;
    const parsed = new Date(`${day} ${monthName} ${year.length === 2 ? `20${year}` : year}`);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function buildDate(year, month, day) {
  const next = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    Number.isNaN(next.getTime()) ||
    next.getFullYear() !== Number(year) ||
    next.getMonth() !== Number(month) - 1 ||
    next.getDate() !== Number(day)
  ) {
    return null;
  }
  return new Date(next.getFullYear(), next.getMonth(), next.getDate());
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return startOfDay(next);
}

export function compareDayDates(a, b) {
  return startOfDay(a).getTime() - startOfDay(b).getTime();
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function compareMonthDates(a, b) {
  return a.getFullYear() * 12 + a.getMonth() - (b.getFullYear() * 12 + b.getMonth());
}

export function isValidTransactionDate(value) {
  if (!value) return false;
  return Boolean(parseAppDate(value));
}

export function isTransactionInMonth(transaction, viewDate) {
  if (!isValidTransactionDate(transaction.transaction_date)) return false;
  const date = parseAppDate(transaction.transaction_date);
  if (!date) return false;
  return date.getFullYear() === viewDate.getFullYear() && date.getMonth() === viewDate.getMonth();
}

export function formatCurrency(value) {
  return `£${Number(value || 0).toFixed(2)}`;
}

export function formatCompactCurrency(value) {
  const amount = Number(value || 0);
  if (amount >= 1000) return `£${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`;
  return `£${amount.toFixed(0)}`;
}

export function formatMonthYear(date) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDateShort(date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateLong(date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function numberOrNull(value) {
  if (value === "" || value == null) return null;
  const next = Number(value);
  return Number.isNaN(next) ? null : next;
}

export function intOrNull(value) {
  if (value === "" || value == null) return null;
  const next = parseInt(value, 10);
  return Number.isNaN(next) ? null : next;
}

export function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function isThisMonth(dateString) {
  if (!dateString) return false;
  const date = new Date(dateString);
  const now = new Date();

  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}
