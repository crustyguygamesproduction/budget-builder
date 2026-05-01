import { styles } from "../styles";
import {
  addDays,
  compareDayDates,
  compareMonthDates,
  formatCurrency,
  formatDateLong,
  formatMonthYear,
  isInternalTransferLike,
  isTransactionInMonth,
  isValidTransactionDate,
  normalizeText,
  parseAppDate,
  startOfDay,
  startOfMonth,
  toIsoDate,
} from "./finance";

export function getCalendarSummaryGridStyle(screenWidth) {
  return {
    ...styles.grid,
    marginBottom: "14px",
    gridTemplateColumns: screenWidth <= 480 ? "1fr 1fr" : "repeat(4, 1fr)",
  };
}

export function getRollingDaysGridStyle(screenWidth, dayCount) {
  if (dayCount <= 1) {
    return {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: "8px",
    };
  }

  if (dayCount <= 7) {
    return {
      display: "grid",
      gridTemplateColumns: screenWidth <= 768 ? "repeat(2, minmax(0, 1fr))" : `repeat(${dayCount}, minmax(0, 1fr))`,
      gap: "8px",
    };
  }

  return {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: "8px",
  };
}

export function clampDayToRange(date, bounds) {
  const next = startOfDay(date);
  if (compareDayDates(next, bounds.start) < 0) return bounds.start;
  if (compareDayDates(next, bounds.end) > 0) return bounds.end;
  return next;
}

export function canShiftShortWindow(endDate, bounds, windowSize, direction) {
  const candidateEnd = addDays(endDate, direction * windowSize);
  const candidateStart = addDays(candidateEnd, -(windowSize - 1));
  if (direction < 0) return compareDayDates(candidateStart, bounds.start) >= 0;
  return compareDayDates(candidateEnd, bounds.end) <= 0;
}

export function getTimeframeStartDate(timeframe, referenceDate = new Date()) {
  if (timeframe === "all") return null;
  const monthsBack = {
    "1m": 1,
    "3m": 3,
    "6m": 6,
    "12m": 12,
  }[timeframe] || 6;
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth() - (monthsBack - 1), 1);
}

export function getCalendarMonthBounds(transactions, timeframe) {
  const validDates = transactions
    .map((transaction) => parseAppDate(transaction.transaction_date))
    .filter(Boolean)
    .sort((a, b) => a - b);

  const todayMonth = startOfMonth(new Date());
  const earliestMonth = validDates.length ? startOfMonth(validDates[0]) : todayMonth;
  const latestMonth = validDates.length ? startOfMonth(validDates[validDates.length - 1]) : todayMonth;
  const timeframeStart = getTimeframeStartDate(timeframe, latestMonth);
  const start = timeframeStart && compareMonthDates(timeframeStart, earliestMonth) > 0 ? timeframeStart : earliestMonth;

  return {
    start,
    end: latestMonth,
    startKey: `${start.getFullYear()}-${start.getMonth()}`,
    endKey: `${latestMonth.getFullYear()}-${latestMonth.getMonth()}`,
  };
}

export function clampMonthToRange(viewDate, bounds) {
  const monthDate = startOfMonth(viewDate);
  if (compareMonthDates(monthDate, bounds.start) < 0) return bounds.start;
  if (compareMonthDates(monthDate, bounds.end) > 0) return bounds.end;
  return monthDate;
}

export function canShiftCalendarMonth(viewDate, bounds, direction) {
  const candidate = new Date(viewDate.getFullYear(), viewDate.getMonth() + direction, 1);
  return compareMonthDates(candidate, bounds.start) >= 0 && compareMonthDates(candidate, bounds.end) <= 0;
}

export function isShortTimeframe(timeframe) {
  return ["1d", "1w", "2w"].includes(timeframe);
}

export function getTimeframeDayCount(timeframe) {
  return {
    "1d": 1,
    "1w": 7,
    "2w": 14,
  }[timeframe] || 0;
}

export function getTimeframeMonthCount(timeframe) {
  return {
    "1d": 0,
    "1w": 0,
    "2w": 0,
    "1m": 1,
    "3m": 3,
    "6m": 6,
    "12m": 12,
    all: 1,
  }[timeframe] || 1;
}

export function getEarliestHistoryDate(transactions) {
  const validDates = transactions
    .map((transaction) => parseAppDate(transaction.transaction_date))
    .filter(Boolean)
    .sort((a, b) => a - b);
  return validDates.length ? startOfDay(validDates[0]) : startOfDay(new Date());
}

export function getLatestHistoryDate(transactions) {
  const validDates = transactions
    .map((transaction) => parseAppDate(transaction.transaction_date))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const today = startOfDay(new Date());
  return validDates.length ? startOfDay(validDates[validDates.length - 1]) : today;
}

export function filterTransactionsByTimeframe(transactions, timeframe, referenceDate = null) {
  const bounds = referenceDate
    ? { start: getTimeframeStartDate(timeframe, referenceDate), end: startOfMonth(referenceDate) }
    : getCalendarMonthBounds(transactions, timeframe);

  return transactions.filter((transaction) => {
    if (!isValidTransactionDate(transaction.transaction_date)) return false;
    const parsedDate = parseAppDate(transaction.transaction_date);
    if (!parsedDate) return false;
    const date = startOfMonth(parsedDate);
    if (bounds.start && compareMonthDates(date, bounds.start) < 0) return false;
    if (bounds.end && compareMonthDates(date, bounds.end) > 0) return false;
    return true;
  });
}

export function buildRollingHistoryWindow(transactions, endDate, dayCount) {
  const safeDayCount = Math.max(dayCount || 1, 1);
  const normalizedEnd = startOfDay(endDate);
  const startDate = addDays(normalizedEnd, -(safeDayCount - 1));
  const days = [];

  for (let i = 0; i < safeDayCount; i += 1) {
    const date = addDays(startDate, i);
    const iso = toIsoDate(date);
    const dayTransactions = transactions
      .filter((transaction) => {
        const parsed = parseAppDate(transaction.transaction_date);
        return parsed && toIsoDate(parsed) === iso;
      })
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    const settled = dayTransactions.filter((transaction) => !isInternalTransferLike(transaction));
    const earned = settled
      .filter((transaction) => Number(transaction.amount) > 0)
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const spent = settled
      .filter((transaction) => Number(transaction.amount) < 0)
      .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);

    days.push({
      key: `${iso}-rolling-${i}`,
      date,
      inMonth: true,
      isFutureDay: false,
      transactions: dayTransactions,
      events: [],
      recurringEvents: [],
      earned,
      spent,
      net: earned - spent,
      previewLabels: dayTransactions.slice(0, 2).map((transaction) => cleanEventTitle(transaction.description || "Transaction")),
    });
  }

  return { days, startDate, endDate: normalizedEnd };
}

export function getRollingWindowSummary(days) {
  const settledDays = days || [];
  const spent = settledDays.reduce((sum, day) => sum + Number(day.spent || 0), 0);
  const earned = settledDays.reduce((sum, day) => sum + Number(day.earned || 0), 0);
  const activeDays = settledDays.filter((day) => (day.transactions?.length || 0) > 0).length;

  return {
    spent,
    earned,
    net: earned - spent,
    activeDays,
  };
}

export function formatShortWeekday(date) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date);
}

export function formatShortWindowTitle(startDate, endDate, timeframe) {
  if (timeframe === "1d") return formatDateLong(endDate);

  const sameMonth = startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear();
  const startLabel = sameMonth
    ? `${startDate.getDate()}`
    : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(startDate);
  const endLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(endDate);
  return `${startLabel} to ${endLabel}`;
}

export function getMonthlyHistorySummary(viewDate, transactions) {
  const monthTransactions = transactions.filter((transaction) => isTransactionInMonth(transaction, viewDate));
  const settled = monthTransactions.filter((transaction) => !isInternalTransferLike(transaction));
  const spent = settled
    .filter((transaction) => Number(transaction.amount) < 0)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const earned = settled
    .filter((transaction) => Number(transaction.amount) > 0)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const activeDays = new Set(monthTransactions.map((transaction) => transaction.transaction_date).filter(Boolean)).size;

  return {
    spent,
    earned,
    net: earned - spent,
    activeDays,
    count: monthTransactions.length,
  };
}

export function getMonthlyBreakdown(transactions, timeframe) {
  const filtered = filterTransactionsByTimeframe(transactions, timeframe);
  const groups = new Map();

  filtered.forEach((transaction) => {
    if (!isValidTransactionDate(transaction.transaction_date) || isInternalTransferLike(transaction)) return;
    const date = parseAppDate(transaction.transaction_date);
    if (!date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: formatMonthYear(date),
        spent: 0,
        earned: 0,
        activeDays: new Set(),
      });
    }

    const group = groups.get(key);
    const amount = Number(transaction.amount || 0);
    if (amount >= 0) group.earned += amount;
    else group.spent += Math.abs(amount);
    group.activeDays.add(transaction.transaction_date);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      activeDays: group.activeDays.size,
      net: group.earned - group.spent,
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

export function getCalendarPatternSummary(transactions, timeframe) {
  const months = getMonthlyBreakdown(transactions, isShortTimeframe(timeframe) ? "1m" : timeframe);
  const filtered = filterTransactionsByTimeframe(transactions, timeframe).filter(
    (transaction) => !isInternalTransferLike(transaction)
  );

  if (!filtered.length) {
    return {
      headline: "Nothing to read yet",
      body: "Once a few real transactions land, the app can start spotting rhythm and pressure points here.",
    };
  }

  const weekdayTotals = Array.from({ length: 7 }, () => 0);
  filtered.forEach((transaction) => {
    if (Number(transaction.amount) >= 0) return;
    const date = parseAppDate(transaction.transaction_date);
    if (!date) return;
    weekdayTotals[date.getDay()] += Math.abs(Number(transaction.amount || 0));
  });

  const busiestWeekdayIndex = weekdayTotals.indexOf(Math.max(...weekdayTotals));
  const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const latestMonth = months[0] || null;
  const previousMonth = months[1] || null;

  if (isShortTimeframe(timeframe)) {
    return {
      headline: timeframe === "1d" ? "Single-day read" : "Short-range rhythm check",
      body: `${weekdayLabels[busiestWeekdayIndex]} is currently your heaviest spend day inside this ${timeframe.toUpperCase()} window. As more weeks land, the read gets sharper.`,
    };
  }

  if (!latestMonth || months.length < 2) {
    return {
      headline: "Early monthly read",
      body: `${latestMonth?.label || "This month"} is the only solid month in view so far. ${weekdayLabels[busiestWeekdayIndex]} is currently your heaviest spend day.`,
    };
  }

  const monthShift = latestMonth.spent - previousMonth.spent;

  if (monthShift >= previousMonth.spent * 0.12) {
    return {
      headline: "Recent month looks heavier",
      body: `${latestMonth.label} spent ${formatCurrency(latestMonth.spent)} versus ${formatCurrency(previousMonth.spent)} the month before. ${weekdayLabels[busiestWeekdayIndex]} is your heaviest spend day overall.`,
    };
  }

  if (monthShift <= -previousMonth.spent * 0.12) {
    return {
      headline: "Recent month looks calmer",
      body: `${latestMonth.label} spent ${formatCurrency(latestMonth.spent)} versus ${formatCurrency(previousMonth.spent)} the month before. ${weekdayLabels[busiestWeekdayIndex]} is still your most expensive weekday pattern.`,
    };
  }

  return {
    headline: "Your pattern looks steady enough to read",
    body: `${weekdayLabels[busiestWeekdayIndex]} is your heaviest spend day overall, and your recent months look more steady than chaotic.`,
  };
}

export function buildHistoricalCalendarMonth(viewDate, transactions, recurringEvents) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const firstDay = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstDay);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    date.setHours(0, 0, 0, 0);
    const iso = toIsoDate(date);
    const dayTransactions = transactions
      .filter((transaction) => {
        const parsed = parseAppDate(transaction.transaction_date);
        return parsed && toIsoDate(parsed) === iso;
      })
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    const settled = dayTransactions.filter((transaction) => !isInternalTransferLike(transaction));
    const earned = settled
      .filter((transaction) => Number(transaction.amount) > 0)
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const spent = settled
      .filter((transaction) => Number(transaction.amount) < 0)
      .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
    const dayRecurring = recurringEvents.filter((event) => event.day === date.getDate());

    days.push({
      key: `${iso}-${i}`,
      date,
      inMonth: date.getMonth() === month,
      isFutureDay: date > today,
      transactions: dayTransactions,
      recurringEvents: dayRecurring,
      earned,
      spent,
      net: earned - spent,
      previewLabels: dayTransactions.slice(0, 2).map((transaction) => cleanEventTitle(transaction.description || "Transaction")),
    });
  }

  return { days };
}

export async function fileToDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });
}

export function getRecurringCalendarEvents(transactions) {
  const grouped = {};

  transactions.forEach((transaction) => {
    if (!transaction.transaction_date) return;
    if (isInternalTransferLike(transaction)) return;
    if (!isFutureCalendarCommitment(transaction)) return;

    const normalizedTitle = getRecurringTitleKey(transaction.description || "");
    if (!normalizedTitle) return;

    const amount = Math.abs(Number(transaction.amount || 0));
    const date = parseAppDate(transaction.transaction_date);
    if (!date) return;

    const key = normalizedTitle;
    if (!grouped[key]) {
      grouped[key] = {
        key,
        titleKey: normalizedTitle,
        description: transaction.description,
        amounts: [],
        dates: [],
        count: 0,
        hasFixedSignal: false,
        strongKeyword: false,
      };
    }

    const group = grouped[key];
    group.dates.push(date);
    group.amounts.push(amount);
    group.count += 1;
    group.hasFixedSignal = group.hasFixedSignal || isConfirmedFixedCommitment(transaction);
    group.strongKeyword = group.strongKeyword || hasBillOrSubscriptionKeyword(transaction.description || "");
  });

  return selectBelievableCalendarCommitments(Object.values(grouped))
    .map((value) => {
      const months = new Set(
        value.dates.map((date) => `${date.getFullYear()}-${date.getMonth() + 1}`)
      );
      const kind = inferOutgoingKind(value.description, value.hasFixedSignal);
      const averageAmount = average(value.amounts);
      const latestAmount = getLatestAmount(value.dates, value.amounts);
      const expectedAmount = value.amounts.length >= 3 ? averageAmount : latestAmount;
      const day = estimateRecurringDay(value.dates);
      const confidence = getRecurringConfidence(months.size, value.dates, value.strongKeyword, value.hasFixedSignal);

      return {
        key: value.key,
        title: cleanEventTitle(value.description),
        amount: -Math.abs(expectedAmount),
        day,
        month: null,
        kind,
        kindLabel:
          kind === "bill"
            ? "Bill"
            : "Subscription",
        confidenceLabel: confidence,
        estimateNote: buildEstimateNote(value.dates, value.amounts, confidence),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.day - b.day || Math.abs(b.amount) - Math.abs(a.amount));
}

function isFutureCalendarCommitment(transaction) {
  const amount = Math.abs(Number(transaction?.amount || 0));
  if (Number(transaction?.amount || 0) >= 0 || amount < 3) return false;
  if (isConfirmedFixedCommitment(transaction)) return true;

  const text = normalizeText(transaction?.description);
  if (hasBillOrSubscriptionKeyword(text)) return true;
  return false;
}

function isConfirmedFixedCommitment(transaction) {
  const category = normalizeText(transaction?._smart_category || transaction?.category);
  return Boolean(
    transaction?._smart_is_bill ||
      transaction?.is_bill ||
      transaction?._smart_is_subscription ||
      transaction?.is_subscription ||
      /rent|mortgage|major bill|council tax|energy|water|broadband|phone|mobile|insurance|subscription|utilities/.test(category)
  );
}

function selectBelievableCalendarCommitments(groups) {
  return groups.filter((group) => {
    const monthCount = new Set(group.dates.map((date) => `${date.getFullYear()}-${date.getMonth()}`)).size;
    if (monthCount >= 2) return true;
    if (group.hasFixedSignal && group.strongKeyword) return true;
    return false;
  });
}

export function inferOutgoingKind(description, hasFixedSignal = false) {
  const text = normalizeText(description);

  if (
    text.includes("netflix") ||
    text.includes("spotify") ||
    text.includes("prime") ||
    text.includes("amazon prime") ||
    text.includes("apple") ||
    text.includes("google") ||
    text.includes("disney") ||
    text.includes("odeon") ||
    text.includes("cinema") ||
    text.includes("icloud") ||
    text.includes("openai") ||
    text.includes("chatgpt") ||
    text.includes("xbox") ||
    text.includes("playstation") ||
    text.includes("audible") ||
    text.includes("patreon")
  ) {
    return "subscription";
  }

  return hasFixedSignal || hasBillKeyword(text) ? "bill" : "subscription";
}

function hasBillOrSubscriptionKeyword(value) {
  const text = normalizeText(value);
  return /\b(rent|mortgage|landlord|letting|council tax|water|thames water|southern water|energy|electric|electricity|gas|eon|e on|eon next|octopus|british gas|edf|ovo|bulb|shell energy|utility|utilities|broadband|internet|wifi|ee|bt|vodafone|o2|three|3 mobile|giffgaff|sky|virgin media|talktalk|plusnet|insurance|tv licence|licence|subscription|netflix|spotify|apple|google|amazon prime|prime video|disney|openai|chatgpt|icloud|adobe|microsoft|xbox|playstation|audible|patreon)\b/.test(text);
}

function hasBillKeyword(value) {
  const text = normalizeText(value);
  return /\b(rent|mortgage|landlord|letting|council tax|water|energy|electric|electricity|gas|eon|e on|eon next|octopus|british gas|edf|ovo|utility|utilities|broadband|internet|wifi|ee|bt|vodafone|o2|three|sky|virgin media|talktalk|plusnet|insurance|tv licence|licence)\b/.test(text);
}

function getRecurringTitleKey(description) {
  const text = normalizeText(description)
    .replace(/\b(card purchase|debit card|direct debit|dd|standing order|faster payment|contactless|online payment|payment to|payment from|ref|reference)\b/g, " ")
    .replace(/\b\d{2,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const known = [
    ["eon next", /\be\s?on\s?next\b|\beon\b/],
    ["octopus energy", /\boctopus\b/],
    ["ee", /\bee\b|\bee limited\b/],
    ["bt", /\bbt\b|\bbritish telecom\b/],
    ["virgin media", /\bvirgin media\b/],
    ["vodafone", /\bvodafone\b/],
    ["o2", /\bo2\b/],
    ["three", /\bthree\b|\b3 mobile\b/],
    ["netflix", /\bnetflix\b/],
    ["spotify", /\bspotify\b/],
    ["apple", /\bapple\b|\bicloud\b/],
    ["google", /\bgoogle\b/],
    ["openai", /\bopenai\b|\bchatgpt\b/],
    ["amazon prime", /\bamazon prime\b|\bprime video\b/],
    ["council tax", /\bcouncil tax\b/],
    ["tv licence", /\btv licen[cs]e\b/],
  ];

  const match = known.find(([, regex]) => regex.test(text));
  if (match) return match[0];

  return text.split(" ").slice(0, 5).join(" ");
}

function estimateRecurringDay(dates) {
  if (!dates.length) return 1;

  const days = dates.map((date) => date.getDate()).sort((a, b) => a - b);
  const counts = days.reduce((map, day) => {
    map.set(day, (map.get(day) || 0) + 1);
    return map;
  }, new Map());
  const mostCommon = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];

  if (mostCommon && mostCommon[1] >= 2) return mostCommon[0];

  return Math.round(average(days));
}

function getRecurringConfidence(monthCount, dates, strongKeyword, hasFixedSignal) {
  const days = dates.map((date) => date.getDate());
  const daySpread = days.length ? Math.max(...days) - Math.min(...days) : 0;

  if (monthCount >= 4 && daySpread <= 5) return "high";
  if (monthCount >= 3) return "medium";
  if (monthCount >= 2 && (strongKeyword || hasFixedSignal)) return "medium";
  return "estimated";
}

function buildEstimateNote(dates, amounts, confidence) {
  if (confidence === "high") return "Based on a stable repeated payment pattern.";
  if (confidence === "medium") return "Estimated from previous statement dates.";
  return `Rough estimate from ${dates.length} previous payment${dates.length === 1 ? "" : "s"}. Upload more statements to improve this.`;
}

function average(values) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value));
  if (!safe.length) return 0;
  return safe.reduce((sum, value) => sum + value, 0) / safe.length;
}

function getLatestAmount(dates, amounts) {
  const latestIndex = dates.reduce((bestIndex, date, index) => {
    if (bestIndex < 0) return index;
    return date > dates[bestIndex] ? index : bestIndex;
  }, -1);

  return latestIndex >= 0 ? amounts[latestIndex] : average(amounts);
}

export function cleanEventTitle(description) {
  const text = String(description || "").trim();
  if (!text) return "Money Event";
  return text.length > 28 ? `${text.slice(0, 28)}...` : text;
}

export function buildCalendarMonth(viewDate, recurringEvents) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const firstDay = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstDay);

  const days = [];

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);

    const events = recurringEvents.filter((event) => event.day === date.getDate());

    days.push({
      key: `${date.toISOString()}-${i}`,
      date,
      inMonth: date.getMonth() === month,
      events,
    });
  }

  return { days };
}

export function downloadCalendarEvent(event) {
  const nextDate = getNextEventDate(event.day);
  const endDate = new Date(nextDate);
  endDate.setHours(endDate.getHours() + 1);

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Money Hub//Money Calendar//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}-${event.key}@moneyhub`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(nextDate)}`,
    `DTEND:${toIcsDate(endDate)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(
      `${event.kindLabel} · ${event.amount > 0 ? "+" : "-"}£${Math.abs(
        event.amount
      ).toFixed(2)} · Added from Money Hub`
    )}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.title.replace(/\s+/g, "-").toLowerCase()}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function getNextEventDate(day) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  let candidate = new Date(year, month, Math.min(day, daysInMonth(year, month)));

  if (candidate < now) {
    const nextMonth = new Date(year, month + 1, 1);
    candidate = new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      Math.min(day, daysInMonth(nextMonth.getFullYear(), nextMonth.getMonth()))
    );
  }

  candidate.setHours(9, 0, 0, 0);
  return candidate;
}

export function toIcsDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(
    date.getUTCDate()
  )}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(
    date.getUTCSeconds()
  )}Z`;
}

export function escapeIcsText(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}
