export function normaliseCounterparty(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(card payment|card purchase|contactless|faster payment|standing order|direct debit|online banking|pos|pending|payment|purchase)\b/g, " ")
    .replace(/\b(fp|dd|so|pos|ref|auth|visa|mastercard)\b/g, " ")
    .replace(/\d{4,}/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 3)
    .slice(0, 6)
    .join(" ")
    .trim() || "unknown";
}

export function amountBucket(amount) {
  const abs = Math.abs(Number(amount || 0));
  if (abs < 10) return Math.round(abs * 2) / 2;
  if (abs < 100) return Math.round(abs);
  if (abs < 1000) return Math.round(abs / 5) * 5;
  return Math.round(abs / 25) * 25;
}

function dayOfMonth(date) {
  const day = Number(String(date || "").slice(8, 10));
  return Number.isFinite(day) ? day : null;
}

function monthKey(date) {
  const value = String(date || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(value) ? value : "unknown";
}

function compactRow(row) {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    merchant: row.merchant,
    amount: row.amount,
    direction: row.direction,
    category: row.category,
    is_bill: row.is_bill,
    is_subscription: row.is_subscription,
    is_internal_transfer: row.is_internal_transfer,
    is_income: row.is_income,
  };
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function looksLikeFixedCommitment(row) {
  const text = `${row.description || ""} ${row.merchant || ""} ${row.category || ""}`.toLowerCase();
  const amount = Math.abs(Number(row.amount || 0));
  return (
    Boolean(row.is_bill || row.is_subscription) ||
    amount >= 120 ||
    /rent|mortgage|council|energy|electric|gas|water|broadband|phone|mobile|insurance|loan|credit|finance|childcare|nursery|tax|licence|license|annual|yearly/.test(text)
  );
}

function looksLikeSplitCommitment(row) {
  const text = `${row.description || ""} ${row.merchant || ""} ${row.category || ""}`.toLowerCase();
  return Number(row.amount || 0) < 0 && !row.is_internal_transfer && /rent|mortgage|council|loan|credit|finance|childcare|nursery/.test(text);
}

export function buildTransactionIntelligence(rows, options = {}) {
  const maxRecurringCandidates = options.maxRecurringCandidates || 80;
  const maxSuspiciousGroups = options.maxSuspiciousGroups || 80;
  const maxLargeOutgoings = options.maxLargeOutgoings || 80;
  const maxRepresentativeRows = options.maxRepresentativeRows || 160;
  const maxAnnualCandidates = options.maxAnnualCandidates || 50;
  const maxSplitPaymentCandidates = options.maxSplitPaymentCandidates || 50;

  const groups = new Map();
  const categoryTotals = new Map();
  const merchantTotals = new Map();
  const splitBuckets = new Map();

  for (const row of rows || []) {
    const counterparty = normaliseCounterparty(row.merchant || row.description);
    const bucket = amountBucket(row.amount);
    const key = [counterparty, row.direction || "unknown", row.category || "uncategorised", bucket, row.is_bill, row.is_subscription, row.is_internal_transfer].join("|");
    const month = monthKey(row.date);
    const day = dayOfMonth(row.date);
    const amount = Number(row.amount || 0);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        counterparty,
        direction: row.direction,
        category: row.category,
        amount_bucket: bucket,
        flags: {
          is_bill: Boolean(row.is_bill),
          is_subscription: Boolean(row.is_subscription),
          is_internal_transfer: Boolean(row.is_internal_transfer),
          is_income: Boolean(row.is_income),
        },
        count: 0,
        total: 0,
        min_amount: amount,
        max_amount: amount,
        months: new Set(),
        days: [],
        source_transaction_ids: [],
        examples: [],
      });
    }

    const group = groups.get(key);
    group.count += 1;
    group.total += amount;
    group.min_amount = Math.min(group.min_amount, amount);
    group.max_amount = Math.max(group.max_amount, amount);
    group.months.add(month);
    if (day) group.days.push(day);
    if (group.source_transaction_ids.length < 24) group.source_transaction_ids.push(row.id);
    if (group.examples.length < 3) group.examples.push(compactRow(row));

    const categoryKey = row.category || "uncategorised";
    if (!categoryTotals.has(categoryKey)) categoryTotals.set(categoryKey, { category: categoryKey, count: 0, total: 0 });
    categoryTotals.get(categoryKey).count += 1;
    categoryTotals.get(categoryKey).total += amount;

    if (!merchantTotals.has(counterparty)) merchantTotals.set(counterparty, { counterparty, count: 0, total: 0, source_transaction_ids: [] });
    const merchant = merchantTotals.get(counterparty);
    merchant.count += 1;
    merchant.total += amount;
    if (merchant.source_transaction_ids.length < 12) merchant.source_transaction_ids.push(row.id);

    if (looksLikeSplitCommitment(row) && month !== "unknown") {
      const splitKey = `${counterparty}|${month}|${row.category || "uncategorised"}`;
      if (!splitBuckets.has(splitKey)) {
        splitBuckets.set(splitKey, {
          key: splitKey,
          counterparty,
          month,
          category: row.category,
          count: 0,
          total: 0,
          source_transaction_ids: [],
          examples: [],
        });
      }
      const split = splitBuckets.get(splitKey);
      split.count += 1;
      split.total += amount;
      if (split.source_transaction_ids.length < 12) split.source_transaction_ids.push(row.id);
      if (split.examples.length < 4) split.examples.push(compactRow(row));
    }
  }

  const grouped = [...groups.values()].map((group) => ({
    ...group,
    month_count: group.months.size,
    months: [...group.months].filter((month) => month !== "unknown").slice(-8),
    usual_day: group.days.length ? Math.round(group.days.reduce((sum, day) => sum + day, 0) / group.days.length) : null,
    average_amount: roundMoney(group.total / Math.max(group.count, 1)),
    total: roundMoney(group.total),
    months_seen: undefined,
  }));

  const recurringCandidates = grouped
    .filter((group) => group.count >= 2 && group.month_count >= 2 && !group.flags.is_internal_transfer)
    .sort((a, b) => b.month_count - a.month_count || b.count - a.count || Math.abs(b.total) - Math.abs(a.total))
    .slice(0, maxRecurringCandidates);

  const annualCandidates = grouped
    .filter((group) => {
      const example = group.examples?.[0] || {};
      return group.count >= 1 && group.month_count <= 2 && !group.flags.is_internal_transfer && looksLikeFixedCommitment(example);
    })
    .sort((a, b) => Math.abs(b.average_amount) - Math.abs(a.average_amount))
    .slice(0, maxAnnualCandidates);

  const splitPaymentCandidates = [...splitBuckets.values()]
    .filter((group) => group.count >= 2 && Math.abs(group.total) >= 200)
    .map((group) => ({ ...group, total: roundMoney(group.total) }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .slice(0, maxSplitPaymentCandidates);

  const suspiciousGroups = grouped
    .filter((group) => {
      const abs = Math.abs(group.average_amount || 0);
      return !group.flags.is_internal_transfer && (abs >= 150 || group.count >= 4 || group.flags.is_bill || group.flags.is_subscription);
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .slice(0, maxSuspiciousGroups);

  const largeOutgoings = (rows || [])
    .filter((row) => Number(row.amount) < 0 && !row.is_internal_transfer)
    .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
    .slice(0, maxLargeOutgoings)
    .map(compactRow);

  const representativeRows = [
    ...(rows || []).slice(-120),
    ...largeOutgoings.slice(0, 40),
    ...annualCandidates.flatMap((group) => group.examples || []),
    ...splitPaymentCandidates.flatMap((group) => group.examples || []),
  ];
  const seen = new Set();

  return {
    total_rows: (rows || []).length,
    date_range: {
      start: (rows || []).map((row) => row.date).filter(Boolean).sort().at(0) || null,
      end: (rows || []).map((row) => row.date).filter(Boolean).sort().at(-1) || null,
    },
    category_totals: [...categoryTotals.values()]
      .map((item) => ({ ...item, total: roundMoney(item.total) }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      .slice(0, 40),
    merchant_totals: [...merchantTotals.values()]
      .map((item) => ({ ...item, total: roundMoney(item.total) }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      .slice(0, 60),
    recurring_candidates: recurringCandidates,
    annual_or_rare_commitment_candidates: annualCandidates,
    split_payment_candidates: splitPaymentCandidates,
    suspicious_or_high_impact_groups: suspiciousGroups,
    large_outgoing_samples: largeOutgoings,
    representative_raw_sample: representativeRows.filter((row) => {
      if (!row?.id || seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    }).slice(0, maxRepresentativeRows),
  };
}
