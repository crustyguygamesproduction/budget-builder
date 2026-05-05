import { formatCurrency } from "./finance";

export function buildCalendarMonthlyRows({ cleanRows, rawRows, timeframe = "all" } = {}) {
  const clean = Array.isArray(cleanRows)
    ? cleanRows
        .filter((row) => row?.month && row?.label)
        .slice()
        .sort((a, b) => String(b.month).localeCompare(String(a.month)))
    : [];

  if (clean.length > 0) {
    const count = timeframe === "all" ? 6 : Math.min(Math.max(getTimeframeMonthCount(timeframe), 1), 6);
    return clean.slice(0, count).map(buildCleanCalendarMonthRow);
  }

  return (rawRows || []).map((row) => ({
    key: `raw:${row.key}`,
    label: row.label,
    source: "raw",
    status: "raw_movement",
    valueLabel: "Raw bank movement",
    net: Number(row.net || 0),
    amountText: formatSignedMoney(Number(row.net || 0)),
    detailLabel: `Reference only, seen on ${row.activeDays} day${row.activeDays === 1 ? "" : "s"}`,
    warning: "Raw bank movement can include transfers, refunds or shared money.",
  }));
}

export function buildCleanCalendarMonthRow(row) {
  const flags = Array.isArray(row.review_flags) ? row.review_flags : [];
  const needsChecking = row.calendar_status === "needs_checking" || flags.includes("shared_money_needs_review") || flags.includes("personal_result_needs_checking");
  const net = Number(row.net_after_real_spending ?? (Number(row.real_income || 0) - Number(row.real_spending || 0)));

  if (needsChecking) {
    return {
      key: `clean:${row.month}`,
      label: row.label,
      source: "clean",
      status: "needs_checking",
      valueLabel: "Needs checking",
      net,
      amountText: "Needs checking",
      detailLabel: getNeedsCheckingDetail(flags),
      warning: "Confirm in Review so this stays accurate.",
    };
  }

  return {
    key: `clean:${row.month}`,
    label: row.label,
    source: "clean",
    status: "personal_estimate",
    valueLabel: "Personal net estimate",
    net,
    amountText: formatSignedMoney(net),
    detailLabel: getPersonalEstimateDetail(row, flags),
    warning: flags.includes("raw_outgoings_above_income") || flags.includes("likely_transfers")
      ? "Likely transfers are excluded from this estimate."
      : "",
  };
}

export function getMonthStandout({ monthlyRows = [], cleanFacts = null, sharedBillContributions = {}, missingBillCount = 0 } = {}) {
  const needsCheckingRow = monthlyRows.find((row) => row.status === "needs_checking");
  if (needsCheckingRow) {
    return {
      label: "Quick read",
      headline: `${needsCheckingRow.label} needs checking`,
      body: "Shared money, transfers or timing may be affecting this month. Confirm it in Review before trusting the result.",
    };
  }

  if ((sharedBillContributions?.needsChecking || []).length > 0) {
    return {
      label: "Quick read",
      headline: "Shared money may be affecting the read",
      body: "There is possible rent or bill contribution money waiting in Review, so Calendar is staying cautious.",
    };
  }

  if (missingBillCount > 0) {
    return {
      label: "Quick read",
      headline: "Possible bills need a quick check",
      body: `${missingBillCount} payment${missingBillCount === 1 ? "" : "s"} could be a regular bill. Confirming them keeps the bill calendar useful.`,
    };
  }

  const trend = cleanFacts?.trend;
  if (trend?.direction === "worsening") {
    return {
      label: "Quick read",
      headline: "Recent spending is getting heavier",
      body: `${trend.latest_month || "The latest month"} is above the previous clean month. This uses clean spending, not raw bank movement.`,
    };
  }

  if (trend?.direction === "improving") {
    return {
      label: "Quick read",
      headline: "Recent spending is calming down",
      body: `${trend.latest_month || "The latest month"} looks lighter than the previous clean month, using clean money facts.`,
    };
  }

  const firstPersonal = monthlyRows.find((row) => row.status === "personal_estimate");
  if (firstPersonal) {
    return {
      label: "Quick read",
      headline: "Recent months are readable",
      body: "Calendar is using personal net estimates from clean money facts. Raw bank movement stays out of the conclusion.",
    };
  }

  const firstRaw = monthlyRows.find((row) => row.status === "raw_movement");
  if (firstRaw) {
    return {
      label: "Quick read",
      headline: "Only raw movement is available",
      body: "Treat these months as reference only until the clean money model has enough facts.",
    };
  }

  return {
    label: "Quick read",
    headline: "No monthly pattern yet",
    body: "Upload more statement history and answer Review checks so Calendar can separate bills, transfers and real spending.",
  };
}

function getNeedsCheckingDetail(flags) {
  if (flags.includes("shared_money_needs_review")) return "Shared money may be affecting this month";
  if (flags.includes("personal_result_needs_checking")) return "Result looks too uncertain to call";
  if (flags.includes("partial_month")) return "Partial month";
  return "Review needed before calling this";
}

function getPersonalEstimateDetail(row, flags) {
  if (flags.includes("likely_transfers")) return "Clean estimate, likely transfers excluded";
  if (flags.includes("refund_or_reimbursement")) return "Clean estimate, refunds handled separately";
  if (Number(row.bill_spending_gross || 0) > Number(row.bill_burden || 0)) return "Clean estimate after shared bill money";
  if (row.status === "partial") return "Partial clean month";
  return "Clean money facts";
}

function formatSignedMoney(value) {
  return `${value >= 0 ? "+" : "-"}${formatCurrency(Math.abs(Number(value || 0)))}`;
}

function getTimeframeMonthCount(timeframe) {
  return { "1m": 1, "3m": 3, "6m": 6, "12m": 12, all: 6 }[timeframe] || 6;
}
