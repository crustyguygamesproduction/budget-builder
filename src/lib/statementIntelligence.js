export function getStatementIntelligenceContext(transactions) {
  const settled = transactions.filter((transaction) => !isInternalTransferLike(transaction));
  const spending = settled.filter((transaction) => Number(transaction.amount) < 0);
  const income = settled.filter((transaction) => Number(transaction.amount) > 0);
  const transfers = transactions.filter((transaction) => isInternalTransferLike(transaction));
  const dateRange = getTransactionDateRange(transactions);
  const merchantGroups = buildTransactionGroups(spending, (transaction) =>
    cleanEventTitle(transaction.description || "Unknown merchant")
  );
  const incomeGroups = buildTransactionGroups(income, (transaction) =>
    cleanEventTitle(transaction.description || "Income")
  );
  const categoryGroups = buildTransactionGroups(spending, (transaction) =>
    getMeaningfulCategory(transaction) || "Spending"
  );
  const accountGroups = buildTransactionGroups(transactions, (transaction) =>
    transaction.accounts?.name || transaction.account_name || transaction.account || "Unassigned account"
  );
  const recurringOutgoings = merchantGroups
    .filter((group) => group.count >= 2)
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, 20);
  const largeOutgoings = spending
    .slice()
    .sort((a, b) => Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0)))
    .slice(0, 30)
    .map(toCoachTransaction);
  const largeIncome = income
    .slice()
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 20)
    .map(toCoachTransaction);
  const unusualTransactions = getUnusualTransactions(spending, merchantGroups).slice(0, 30);
  const searchableTransactions = transactions
    .slice()
    .sort((a, b) =>
      String(b.transaction_date || "").localeCompare(String(a.transaction_date || ""))
    )
    .slice(0, 350)
    .map(toCoachTransaction);

  return {
    searchableTransactions,
    searchableTransactionNote:
      transactions.length > searchableTransactions.length
        ? `Most recent ${searchableTransactions.length} transactions are included individually. Full-history summaries use all ${transactions.length} transactions.`
        : `All ${transactions.length} transactions are included individually.`,
    summary: {
      date_range: dateRange,
      totals: getTotals(transactions),
      total_transactions: transactions.length,
      settled_transaction_count: settled.length,
      transfer_transaction_count: transfers.length,
      category_totals: categoryGroups.slice(0, 20),
      merchant_totals: merchantGroups.slice(0, 30),
      income_streams: incomeGroups.slice(0, 20),
      account_activity: accountGroups.slice(0, 20),
      recurring_outgoings: recurringOutgoings,
      large_outgoings: largeOutgoings,
      large_income: largeIncome,
      unusual_transactions: unusualTransactions,
    },
  };
}

function getTotals(transactions) {
  const income = transactions
    .filter((transaction) => Number(transaction.amount) > 0 && !isInternalTransferLike(transaction))
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const spending = transactions
    .filter((transaction) => Number(transaction.amount) < 0 && !isInternalTransferLike(transaction))
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const bills = transactions
    .filter((transaction) => transaction.is_bill || transaction.is_subscription)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);

  return { income, spending, bills, net: income - spending, safeToSpend: 0 };
}

function getTransactionDateRange(transactions) {
  const dates = transactions
    .map((transaction) => parseAppDate(transaction.transaction_date))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (!dates.length) {
    return {
      start: "",
      end: "",
      label: "No statement history",
      months: 0,
    };
  }

  const start = dates[0];
  const end = dates[dates.length - 1];
  const monthKeys = new Set(
    dates.map((date) => `${date.getFullYear()}-${date.getMonth()}`)
  );

  return {
    start: toIsoDate(start),
    end: toIsoDate(end),
    label: `${formatDateShort(start)} to ${formatDateShort(end)}`,
    months: monthKeys.size,
  };
}

function buildTransactionGroups(transactions, getLabel) {
  const groups = new Map();

  transactions.forEach((transaction) => {
    const label = String(getLabel(transaction) || "Unknown").trim() || "Unknown";
    const key = normalizeText(label) || "unknown";
    const amount = Number(transaction.amount || 0);

    if (!groups.has(key)) {
      groups.set(key, {
        label,
        count: 0,
        total: 0,
        money_in: 0,
        money_out: 0,
        average: 0,
        first_date: transaction.transaction_date || "",
        last_date: transaction.transaction_date || "",
        example: transaction.description || "",
      });
    }

    const group = groups.get(key);
    group.count += 1;
    group.total += Math.abs(amount);
    if (amount > 0) group.money_in += amount;
    if (amount < 0) group.money_out += Math.abs(amount);
    group.average = group.total / group.count;

    if (transaction.transaction_date) {
      if (!group.first_date || transaction.transaction_date < group.first_date) {
        group.first_date = transaction.transaction_date;
      }
      if (!group.last_date || transaction.transaction_date > group.last_date) {
        group.last_date = transaction.transaction_date;
      }
    }
  });

  return [...groups.values()].sort((a, b) => b.total - a.total);
}

function getUnusualTransactions(spending, merchantGroups) {
  const merchantAverages = new Map(
    merchantGroups.map((group) => [normalizeText(group.label), group.average])
  );

  return spending
    .map((transaction) => {
      const label = cleanEventTitle(transaction.description || "Unknown merchant");
      const average = merchantAverages.get(normalizeText(label)) || 0;
      const amount = Math.abs(Number(transaction.amount || 0));
      const ratio = average > 0 ? amount / average : 0;
      return {
        ...toCoachTransaction(transaction),
        usual_amount: average,
        unusual_ratio: ratio,
      };
    })
    .filter((transaction) => transaction.amount_abs >= 25 && transaction.unusual_ratio >= 1.75)
    .sort((a, b) => b.unusual_ratio - a.unusual_ratio);
}

function toCoachTransaction(transaction) {
  const amount = Number(transaction.amount || 0);
  return {
    date: transaction.transaction_date || "",
    description: transaction.description || "",
    merchant: cleanEventTitle(transaction.description || "Transaction"),
    amount,
    amount_abs: Math.abs(amount),
    direction: amount > 0 ? "in" : amount < 0 ? "out" : "zero",
    category: getMeaningfulCategory(transaction),
    account: transaction.accounts?.name || transaction.account_name || transaction.account || "",
    is_bill: Boolean(transaction.is_bill),
    is_subscription: Boolean(transaction.is_subscription),
    is_internal_transfer: isInternalTransferLike(transaction),
  };
}

function getMeaningfulCategory(transaction) {
  return transaction?._smart_category || transaction?.category || (Number(transaction?.amount || 0) > 0 ? "Income" : "Spending");
}

function isInternalTransferLike(transaction) {
  return Boolean(transaction?._smart_internal_transfer || transaction?.is_internal_transfer);
}

function cleanEventTitle(description) {
  return String(description || "Transaction")
    .replace(/\s+/g, " ")
    .replace(/\b(card purchase|debit card|faster payment|direct debit|standing order|contactless|online payment)\b/gi, "")
    .trim()
    .split(" ")
    .slice(0, 5)
    .join(" ") || "Transaction";
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAppDate(value) {
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

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function buildDate(year, month, day) {
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateShort(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
