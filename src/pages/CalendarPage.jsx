import { useMemo, useState } from "react";
import { supabase } from "../supabase";
import { InsightCard, MiniCard, Section } from "../components/ui";
import {
  addDays,
  formatCompactCurrency,
  formatCurrency,
  formatDateLong,
  getMeaningfulCategory,
  normalizeText,
  startOfDay,
  toIsoDate,
} from "../lib/finance";
import {
  buildCalendarMonth,
  buildHistoricalCalendarMonth,
  buildRollingHistoryWindow,
  canShiftCalendarMonth,
  canShiftShortWindow,
  clampDayToRange,
  clampMonthToRange,
  downloadCalendarEvent,
  formatShortWeekday,
  formatShortWindowTitle,
  getCalendarMonthBounds,
  getCalendarPatternSummary,
  getCalendarSummaryGridStyle,
  getEarliestHistoryDate,
  getLatestHistoryDate,
  getMonthlyBreakdown,
  getMonthlyHistorySummary,
  getRollingDaysGridStyle,
  getRollingWindowSummary,
  getTimeframeDayCount,
  getTimeframeMonthCount,
  isShortTimeframe,
} from "../lib/calendarIntelligence";
import { getCalendarEventStyle } from "../lib/styleHelpers";
import { cleanBillName, isAllowedBillStream } from "../lib/moneyUnderstandingGuards";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPage({ transactions, moneyUnderstanding, onTransactionRulesChange, onRefreshMoneyUnderstanding, screenWidth, styles, helpers }) {
  const { getDataFreshness } = helpers;

  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDayKey, setSelectedDayKey] = useState("");
  const [calendarMode, setCalendarMode] = useState("recurring");
  const [timeframe, setTimeframe] = useState("all");
  const [calendarAiBusy, setCalendarAiBusy] = useState(false);
  const [calendarAiText, setCalendarAiText] = useState("");
  const [calendarAiError, setCalendarAiError] = useState("");
  const [correctionBusyKey, setCorrectionBusyKey] = useState("");
  const [calendarNotice, setCalendarNotice] = useState("");
  const [showBillsList, setShowBillsList] = useState(false);
  const [showMissingBills, setShowMissingBills] = useState(false);

  const recurringEvents = useMemo(
    () => (moneyUnderstanding?.recurringEvents || [])
      .filter((event) => isAllowedBillStream({
        ...event,
        name: event.title,
        amount: Math.abs(Number(event.amount || 0)),
        kind: event.kind === "subscription" ? "subscription" : "bill",
        confidence: event.confidenceLabel,
        note: event.estimateNote,
      }))
      .map((event) => ({ ...event, title: cleanBillName(event.title) })),
    [moneyUnderstanding]
  );
  const allHistoryMonths = useMemo(
    () => getMonthlyBreakdown(transactions, "all"),
    [transactions]
  );
  const availableMonthCount = allHistoryMonths.length;
  const missingBillCandidates = useMemo(() => getMissingBillCandidates(transactions, recurringEvents), [transactions, recurringEvents]);
  const shortTimeframe = isShortTimeframe(timeframe);
  const usingShortHistoryView = shortTimeframe && calendarMode === "history";
  const shortWindowSize = getTimeframeDayCount(timeframe);
  const earliestHistoryDate = useMemo(
    () => getEarliestHistoryDate(transactions),
    [transactions]
  );
  const latestHistoryDate = useMemo(
    () => getLatestHistoryDate(transactions),
    [transactions]
  );
  const shortWindowBounds = useMemo(
    () => ({ start: earliestHistoryDate, end: startOfDay(new Date()) }),
    [earliestHistoryDate]
  );
  const activeShortEndDate = useMemo(
    () => clampDayToRange(viewDate, shortWindowBounds),
    [viewDate, shortWindowBounds]
  );
  const calendarBounds = useMemo(
    () => getCalendarMonthBounds(transactions, timeframe),
    [transactions, timeframe]
  );
  const recurringBounds = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { start, end: new Date(start.getFullYear(), start.getMonth() + 11, 1) };
  }, []);
  const activeViewDate = useMemo(() => clampMonthToRange(viewDate, calendarBounds), [viewDate, calendarBounds]);
  const activeRecurringViewDate = useMemo(() => clampMonthToRange(viewDate, recurringBounds), [viewDate, recurringBounds]);

  const historicalCalendar = useMemo(() => buildHistoricalCalendarMonth(activeViewDate, transactions, recurringEvents), [activeViewDate, transactions, recurringEvents]);
  const recurringCalendar = useMemo(() => buildCalendarMonth(activeRecurringViewDate, recurringEvents), [activeRecurringViewDate, recurringEvents]);
  const rollingHistoryWindow = useMemo(() => buildRollingHistoryWindow(transactions, activeShortEndDate, shortWindowSize), [transactions, activeShortEndDate, shortWindowSize]);

  const timeframeOptions = [["1d", "1D"],["1w", "1W"],["2w", "2W"],["1m", "1M"],["3m", "3M"],["6m", "6M"],["12m", "12M"],["all", "All"]];
  const timeframeLabel = timeframeOptions.find(([key]) => key === timeframe)?.[1] || timeframe.toUpperCase();

  const calendarDays = calendarMode === "history" ? usingShortHistoryView ? rollingHistoryWindow.days : historicalCalendar.days : recurringCalendar.days;
  const summary = usingShortHistoryView ? getRollingWindowSummary(rollingHistoryWindow.days) : getMonthlyHistorySummary(activeViewDate, transactions);
  const recurringMonthEvents = recurringCalendar.days.filter((day) => day.inMonth !== false).flatMap((day) => day.events || []);
  const recurringMonthTotal = recurringMonthEvents.reduce((sum, event) => sum + Math.abs(Number(event.amount || 0)), 0);
  const currentMonth = new Date();
  const isViewingCurrentRecurringMonth = activeRecurringViewDate.getMonth() === currentMonth.getMonth() && activeRecurringViewDate.getFullYear() === currentMonth.getFullYear();
  const nextRecurringEvent = recurringMonthEvents.filter((event) => !isViewingCurrentRecurringMonth || event.day >= currentMonth.getDate()).sort((a, b) => a.day - b.day)[0] || recurringMonthEvents[0] || null;
  const patternSummary = getCalendarPatternSummary(transactions, timeframe);
  const monthlyBreakdown = getMonthlyBreakdown(transactions, shortTimeframe ? "1m" : timeframe).slice(0, 6);
  const visibleHistoryTransactions = calendarDays.flatMap((day) => day.transactions || []);
  const selectedDay = selectedDayKey ? calendarDays.find((day) => day.key === selectedDayKey) || null : null;
  const canGoPrev = usingShortHistoryView ? canShiftShortWindow(activeShortEndDate, shortWindowBounds, shortWindowSize, -1) : calendarMode === "recurring" ? canShiftCalendarMonth(activeRecurringViewDate, recurringBounds, -1) : canShiftCalendarMonth(activeViewDate, calendarBounds, -1);
  const canGoNext = usingShortHistoryView ? canShiftShortWindow(activeShortEndDate, shortWindowBounds, shortWindowSize, 1) : calendarMode === "recurring" ? canShiftCalendarMonth(activeRecurringViewDate, recurringBounds, 1) : canShiftCalendarMonth(activeViewDate, calendarBounds, 1);
  const shortRangeTitle = usingShortHistoryView ? formatShortWindowTitle(rollingHistoryWindow.startDate, rollingHistoryWindow.endDate, timeframe) : calendarMode === "recurring" ? `${MONTH_NAMES[activeRecurringViewDate.getMonth()]} ${activeRecurringViewDate.getFullYear()}` : `${MONTH_NAMES[activeViewDate.getMonth()]} ${activeViewDate.getFullYear()}`;
  const allowHorizontalScroll = usingShortHistoryView ? shortWindowSize > 7 || screenWidth <= 760 : screenWidth <= 760;

  function clearCalendarAiRead() { setCalendarAiText(""); setCalendarAiError(""); }

  function handleRangeShift(direction) {
    setSelectedDayKey("");
    clearCalendarAiRead();
    if (usingShortHistoryView) {
      if ((direction < 0 && !canGoPrev) || (direction > 0 && !canGoNext)) return;
      setViewDate((current) => clampDayToRange(addDays(startOfDay(current), direction * shortWindowSize), shortWindowBounds));
      return;
    }
    if ((direction < 0 && !canGoPrev) || (direction > 0 && !canGoNext)) return;
    if (calendarMode === "recurring") {
      setViewDate((current) => clampMonthToRange(new Date(current.getFullYear(), current.getMonth() + direction, 1), recurringBounds));
      return;
    }
    setViewDate((current) => clampMonthToRange(new Date(current.getFullYear(), current.getMonth() + direction, 1), calendarBounds));
  }

  function handleTimeframeChange(nextTimeframe) {
    const needsMonths = getTimeframeMonthCount(nextTimeframe);
    const unavailable = needsMonths > 0 && nextTimeframe !== "all" && availableMonthCount < needsMonths;
    if (unavailable) return;
    setTimeframe(nextTimeframe);
    setSelectedDayKey("");
    clearCalendarAiRead();
    if (isShortTimeframe(nextTimeframe)) { setViewDate(latestHistoryDate); return; }
    const nextBounds = getCalendarMonthBounds(transactions, nextTimeframe);
    setViewDate(nextBounds.end);
  }

  function handleDayClick(day) {
    if (calendarMode === "history" && day.isFutureDay) return;
    setSelectedDayKey((current) => (current === day.key ? "" : day.key));
  }

  async function saveCalendarRule({ matchText, amount, category, isBill, isSubscription, notes }) {
    if (!matchText) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("transaction_rules").upsert(
      {
        user_id: user.id,
        rule_type: isBill || isSubscription ? "calendar_confirmed_bill" : "calendar_suppression",
        match_text: matchText,
        match_amount: Math.abs(Number(amount || 0)),
        category,
        is_bill: Boolean(isBill),
        is_subscription: Boolean(isSubscription),
        is_internal_transfer: false,
        notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,rule_type,match_text,match_amount" }
    );
    if (error) throw error;
    await onTransactionRulesChange?.();
  }

  async function markEventNotBill(event) {
    const matchText = getEventMatchText(event);
    if (!matchText) return;

    setCorrectionBusyKey(event.key || matchText);
    setCalendarNotice("");
    try {
      await saveCalendarRule({ matchText, amount: event.amount, category: "Ignore for Calendar", isBill: false, isSubscription: false, notes: `User marked ${event.title} as not a bill from Calendar.` });
      setCalendarNotice(`${event.title} will be hidden from future bills.`);
      setSelectedDayKey("");
    } catch (error) {
      setCalendarNotice(error.message || "Could not save that correction yet.");
    } finally {
      setCorrectionBusyKey("");
    }
  }

  async function markCandidateAsBill(candidate, category) {
    setCorrectionBusyKey(candidate.key);
    setCalendarNotice("");
    try {
      const isSubscription = category === "Subscription";
      await saveCalendarRule({ matchText: candidate.matchText, amount: candidate.amount, category, isBill: !isSubscription, isSubscription, notes: `User confirmed missing Calendar item as ${category}. Example: ${candidate.example}` });
      setCalendarNotice(`${candidate.label} will be treated as ${category.toLowerCase()} now.`);
      await onRefreshMoneyUnderstanding?.();
    } catch (error) {
      setCalendarNotice(error.message || "Could not save that bill yet.");
    } finally {
      setCorrectionBusyKey("");
    }
  }

  async function refreshMissingBills() {
    setShowMissingBills(true);
    setCorrectionBusyKey("refresh-missing-bills");
    setCalendarNotice("Looking again for rent, bills, subscriptions and debts...");
    try {
      await onRefreshMoneyUnderstanding?.();
      setCalendarNotice("Calendar refreshed. Review the missing-bill suggestions below if anything is still missing.");
    } catch (error) {
      setCalendarNotice(error.message || "Could not refresh Calendar yet.");
    } finally {
      setCorrectionBusyKey("");
    }
  }

  async function runCalendarAiAnalysis() {
    setCalendarAiBusy(true);
    setCalendarAiError("");
    try {
      const context = {
        source: "calendar",
        timeframe,
        timeframe_label: timeframeLabel,
        visible_window_label: shortRangeTitle,
        calendar_mode: calendarMode,
        summary,
        calendar_summary: { spent: summary.spent, earned: summary.earned, net: summary.net, active_days: summary.activeDays, recurring_month_total: recurringMonthTotal, recurring_month_count: recurringMonthEvents.length, next_recurring_event: nextRecurringEvent },
        data_freshness: getDataFreshness(transactions),
        monthly_breakdown: monthlyBreakdown.slice(0, 4),
        visible_transactions: visibleHistoryTransactions.slice(0, 30).map((transaction) => ({ date: transaction.transaction_date, description: transaction.description, category: getMeaningfulCategory(transaction), amount: transaction.amount })),
        recurring_events: recurringMonthEvents.slice(0, 20),
        visible_transaction_count: visibleHistoryTransactions.length,
        selected_day: selectedDay ? { date: toIsoDate(selectedDay.date), earned: selectedDay.earned, spent: selectedDay.spent, net: selectedDay.net, transaction_count: selectedDay.transactions?.length || 0 } : null,
      };
      const { data, error } = await supabase.functions.invoke("ai-coach", { body: { mode: "coach", message: calendarMode === "recurring" ? "Analyse the future payments calendar. Explain the next likely bills/subscriptions and point out any estimates. Keep it short and practical." : "Analyse the currently open calendar timeframe. Keep it concise, specific to the visible range, and do not claim there are multiple months unless the provided data clearly includes them.", context } });
      if (error) throw new Error(error.message || "Calendar AI analysis failed.");
      setCalendarAiText(String(data?.reply || "No calendar analysis came back."));
    } catch (error) {
      setCalendarAiError(error.message || "Could not analyse this timeframe yet.");
    } finally {
      setCalendarAiBusy(false);
    }
  }

  return (
    <>
      <Section styles={styles} title="Your Bills Calendar">
        <div style={styles.calendarTopRow}>
          <button style={{ ...styles.secondaryInlineBtn, ...(canGoPrev ? null : styles.calendarNavBtnDisabled) }} type="button" onClick={(event) => { event.currentTarget.blur(); handleRangeShift(-1); }} disabled={!canGoPrev}>Prev</button>
          <div style={styles.calendarTitleWrap}>
            <h4 style={styles.calendarTitle}>{shortRangeTitle}</h4>
            <p style={styles.smallMuted}>{calendarMode === "recurring" ? "Only bills and subscriptions Money Hub is confident about show here. Unsure payments go to Checks." : usingShortHistoryView ? "Showing a short slice of your real spending history." : timeframe === "all" ? "Showing your full uploaded history." : `Showing the latest month inside your ${timeframeLabel} view.`}</p>
          </div>
          <button style={{ ...styles.secondaryInlineBtn, ...(canGoNext ? null : styles.calendarNavBtnDisabled) }} type="button" onClick={(event) => { event.currentTarget.blur(); handleRangeShift(1); }} disabled={!canGoNext}>Next</button>
        </div>

        <div style={styles.calendarToolbar}>
          <div style={styles.modeChipRow}>{[["recurring", "Future bills"],["history", "Past spending"]].map(([key, label]) => (<button key={key} type="button" aria-pressed={calendarMode === key} onClick={(event) => { event.currentTarget.blur(); setCalendarMode(key); setSelectedDayKey(""); clearCalendarAiRead(); if (key === "recurring" && isShortTimeframe(timeframe)) { setTimeframe("all"); setViewDate(recurringBounds.start); return; } if (key === "recurring") setViewDate(recurringBounds.start); }} style={{ ...styles.calendarModeChip, ...(calendarMode === key ? styles.calendarModeChipActive : null) }}>{label}</button>))}</div>
          <div style={styles.modeChipRow}>{timeframeOptions.map(([key, label]) => { const needsMonths = getTimeframeMonthCount(key); const unavailable = needsMonths > 0 && key !== "all" && availableMonthCount < needsMonths; return (<button key={key} type="button" aria-pressed={timeframe === key} onClick={(event) => { event.currentTarget.blur(); handleTimeframeChange(key); }} disabled={calendarMode === "recurring" ? true : unavailable} style={{ ...styles.calendarTimeframeChip, ...(timeframe === key ? styles.calendarTimeframeChipActive : null), ...((calendarMode === "recurring" || unavailable) ? styles.timeframeChipDisabled : null) }}>{label}</button>); })}</div>
        </div>

        {calendarNotice ? <p style={{ ...styles.calendarRangeHint, color: calendarNotice.toLowerCase().includes("could not") ? "#dc2626" : "#2563eb" }}>{calendarNotice}</p> : null}
        {availableMonthCount <= 1 && !shortTimeframe && calendarMode === "history" ? <p style={styles.calendarRangeHint}>You have one month of history so far. Add more statements to make patterns smarter.</p> : null}

        {calendarMode === "recurring" ? (
          <div style={getCalendarSummaryGridStyle(screenWidth)}>
            <MiniCard styles={styles} title="Bills this month" value={formatCurrency(recurringMonthTotal)} />
            <button type="button" onClick={() => setShowBillsList((open) => !open)} style={summaryButtonStyle()}>
              <span>Bills found</span>
              <strong>{recurringMonthEvents.length}</strong>
              <small>{showBillsList ? "Tap to hide" : "Tap to manage"}</small>
            </button>
            <MiniCard styles={styles} title="Next bill" value={nextRecurringEvent ? `${nextRecurringEvent.title}` : "None"} />
            <MiniCard styles={styles} title="Amount" value={nextRecurringEvent ? formatCurrency(Math.abs(nextRecurringEvent.amount)) : "£0.00"} />
          </div>
        ) : (
          <div style={getCalendarSummaryGridStyle(screenWidth)}>
            <MiniCard styles={styles} title="Money out" value={formatCurrency(summary.spent)} />
            <MiniCard styles={styles} title="Money in" value={formatCurrency(summary.earned)} />
            <MiniCard styles={styles} title="Left" value={`${summary.net >= 0 ? "+" : "-"}${formatCurrency(Math.abs(summary.net))}`} />
            <MiniCard styles={styles} title="Days used" value={`${summary.activeDays}`} />
          </div>
        )}

        {calendarMode === "recurring" && showBillsList ? (
          <CalendarBillsPanel events={recurringMonthEvents} styles={styles} busyKey={correctionBusyKey} onNotBill={markEventNotBill} />
        ) : null}

        {calendarMode === "recurring" && showMissingBills ? (
          <MissingBillsPanel candidates={missingBillCandidates} styles={styles} busyKey={correctionBusyKey} onConfirm={markCandidateAsBill} onClose={() => setShowMissingBills(false)} />
        ) : null}

        <div style={{ ...styles.calendarGridViewport, overflowX: allowHorizontalScroll ? "auto" : "hidden" }}>
          <div style={{ ...(shortTimeframe && calendarMode === "history" ? getRollingDaysGridStyle(screenWidth, shortWindowSize) : styles.calendarGrid), minWidth: usingShortHistoryView && allowHorizontalScroll ? `${Math.max(shortWindowSize, 7) * 96}px` : !usingShortHistoryView && screenWidth <= 760 ? "640px" : undefined }}>
            {!usingShortHistoryView ? DAY_NAMES.map((day) => <div key={day} style={styles.calendarDayHeader}>{day}</div>) : null}
            {calendarDays.map((day) => {
              const isSelected = selectedDayKey === day.key;
              const txCount = day.transactions?.length || 0;
              const eventCount = day.events?.length || 0;
              const firstLabel = day.previewLabels?.[0] || day.events?.[0]?.title || "";
              const extraCount = calendarMode === "history" ? Math.max(txCount - 1, 0) : Math.max(eventCount - 1, 0);
              const net = Number(day.net || 0);
              return (
                <button key={day.key} type="button" onClick={() => handleDayClick(day)} disabled={calendarMode === "history" && day.isFutureDay} style={{ ...styles.calendarCell, ...(usingShortHistoryView ? styles.calendarCellShort : null), ...(day.inMonth === false ? styles.calendarCellMuted : null), ...(calendarMode === "history" && day.isFutureDay ? styles.calendarCellFuture : null), ...(isSelected ? styles.calendarCellSelected : null) }}>
                  <div style={styles.calendarDateRow}><div><div style={styles.calendarDate}>{day.date.getDate()}</div>{usingShortHistoryView && calendarMode === "history" ? <div style={styles.calendarWeekdayMini}>{formatShortWeekday(day.date)}</div> : null}</div>{calendarMode === "history" && txCount > 0 ? <span style={styles.calendarCountTag}>{txCount}</span> : calendarMode === "recurring" && eventCount > 0 ? <span style={styles.calendarCountTag}>{eventCount}</span> : null}</div>
                  {calendarMode === "history" ? (<>{day.isFutureDay ? <div style={styles.calendarFutureBlock} /> : txCount > 0 ? <div style={net >= 0 ? styles.calendarNetPillPositive : styles.calendarNetPillNegative}>{net >= 0 ? "+" : "-"}{formatCompactCurrency(Math.abs(net))}</div> : <div style={styles.calendarEmptyHint}>Quiet day</div>}{!day.isFutureDay && firstLabel ? <div style={styles.calendarSingleLabel}>{firstLabel}</div> : null}{!day.isFutureDay && extraCount > 0 ? <div style={styles.calendarMore}>{extraCount} more</div> : null}</>) : (<>{eventCount > 0 ? <div style={styles.calendarRecurringStack}>{day.events.slice(0, 2).map((event) => <div key={event.key} style={getCalendarEventStyle(event.kind)}><span style={styles.calendarEventText}>{event.title}</span></div>)}</div> : <div style={styles.calendarEmptyHint}>Nothing due</div>}{extraCount > 0 ? <div style={styles.calendarMore}>{extraCount} more</div> : null}</>)}
                </button>
              );
            })}
          </div>
        </div>

        {!selectedDay && calendarMode === "history" ? <p style={styles.calendarRangeHint}>Tap a day to see what happened.</p> : null}

        {selectedDay ? (
          <div style={styles.calendarInlinePanel}>
            <div style={styles.calendarInlinePanelTop}><strong>{calendarMode === "history" ? formatDateLong(selectedDay.date) : `${formatDateLong(selectedDay.date)} estimate`}</strong><button style={styles.ghostBtn} type="button" onClick={() => setSelectedDayKey("")}>Close</button></div>
            {calendarMode === "history" ? (selectedDay.transactions.length === 0 ? <p style={styles.emptyText}>{selectedDay.isFutureDay ? "This day has not happened yet." : "Nothing landed on this day."}</p> : <><p style={styles.transactionMeta}>{selectedDay.transactions.length} transaction{selectedDay.transactions.length === 1 ? "" : "s"}. In {formatCurrency(selectedDay.earned)}. Out {formatCurrency(selectedDay.spent)}. Left {selectedDay.net >= 0 ? "+" : "-"}{formatCurrency(Math.abs(selectedDay.net))}</p>{selectedDay.transactions.map((transaction) => <TransactionRow styles={styles} key={transaction.id || `${transaction.transaction_date}-${transaction.description}-${transaction.amount}`} name={transaction.description || "Transaction"} meta={getMeaningfulCategory(transaction) || "Uncategorised"} amount={Number(transaction.amount || 0)} />)}</>) : !selectedDay.events.length ? <p style={styles.emptyText}>Nothing is expected on this date.</p> : selectedDay.events.map((event) => <div key={event.key} style={styles.signalCard}><div style={styles.signalHeader}><div><strong>{event.title}</strong><p style={styles.transactionMeta}>Expected around day {event.day} - {event.kindLabel} - {getPlainMatchLabel(event.confidenceLabel)}</p>{event.estimateNote ? <p style={styles.transactionMeta}>{event.estimateNote}</p> : null}</div><strong>{event.amount > 0 ? "+" : "-"}{formatCurrency(Math.abs(event.amount))}</strong></div><div style={styles.inlineBtnRow}><button style={styles.primaryInlineBtn} onClick={() => downloadCalendarEvent(event)}>Add to Google / Apple Calendar</button><button style={styles.secondaryInlineBtn} type="button" onClick={() => markEventNotBill(event)} disabled={correctionBusyKey === (event.key || getEventMatchText(event))}>{correctionBusyKey === (event.key || getEventMatchText(event)) ? "Saving..." : "Not a bill"}</button></div></div>)}
          </div>
        ) : null}
      </Section>

      <Section styles={styles} title="What Stands Out" right={<div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}><button type="button" style={styles.ghostBtn} onClick={refreshMissingBills} disabled={correctionBusyKey === "refresh-missing-bills"}>{correctionBusyKey === "refresh-missing-bills" ? "Checking..." : "Bills missing?"}</button><button type="button" style={styles.ghostBtn} onClick={runCalendarAiAnalysis} disabled={calendarAiBusy}>{calendarAiBusy ? "Checking..." : "Ask AI"}</button></div>}>
        <InsightCard styles={styles} label={calendarAiText ? "AI answer" : "Quick read"} headline={calendarAiText ? `Read for ${timeframeLabel}` : calendarMode === "recurring" ? "Upcoming bill pressure" : patternSummary.headline} body={calendarAiText || (calendarMode === "recurring" ? recurringMonthEvents.length ? `Money Hub expects ${recurringMonthEvents.length} future bill/payment${recurringMonthEvents.length === 1 ? "" : "s"} this month, totalling about ${formatCurrency(recurringMonthTotal)}. Estimates improve as you add more months and answer Checks.` : "No future bills found yet. Add more history or answer Checks when they appear." : patternSummary.body)} />
        {calendarAiError ? <p style={styles.errorNote}>{calendarAiError}</p> : null}
      </Section>

      <Section styles={styles} title={monthlyBreakdown.length <= 1 ? "This Month" : "Recent Months"}>
        {monthlyBreakdown.length === 0 ? <p style={styles.emptyText}>Add more history to see month-by-month spending.</p> : monthlyBreakdown.length === 1 ? <div style={styles.daySummaryCard}><strong>{monthlyBreakdown[0].label}</strong><p style={styles.transactionMeta}>Money in {formatCurrency(monthlyBreakdown[0].earned)}. Money out {formatCurrency(monthlyBreakdown[0].spent)}. Used on {monthlyBreakdown[0].activeDays} day{monthlyBreakdown[0].activeDays === 1 ? "" : "s"}.</p><p style={{ ...styles.transactionMeta, color: monthlyBreakdown[0].net >= 0 ? "#059669" : "#dc2626", marginTop: "8px" }}>Overall this month: {monthlyBreakdown[0].net >= 0 ? "+" : "-"}{formatCurrency(Math.abs(monthlyBreakdown[0].net))}</p></div> : monthlyBreakdown.map((month) => <div key={month.key} style={styles.monthTrendRow}><div><strong>{month.label}</strong><p style={styles.transactionMeta}>In {formatCurrency(month.earned)}. Out {formatCurrency(month.spent)}. Used on {month.activeDays} day{month.activeDays === 1 ? "" : "s"}</p></div><strong style={{ color: month.net >= 0 ? "#059669" : "#dc2626" }}>{month.net >= 0 ? "+" : "-"}{formatCurrency(Math.abs(month.net))}</strong></div>)}
      </Section>
    </>
  );
}

function CalendarBillsPanel({ events, styles, busyKey, onNotBill }) {
  const uniqueEvents = dedupeEvents(events);
  return <div style={panelStyle()}><div style={panelHeaderStyle()}><div><strong>Bills Money Hub found</strong><p style={styles.transactionMeta}>Remove anything that is not a real bill, rent, debt or subscription.</p></div></div>{uniqueEvents.length ? uniqueEvents.map((event) => <div key={event.key} style={compactRowStyle()}><div><strong>{event.title}</strong><p style={styles.transactionMeta}>About {formatCurrency(Math.abs(event.amount))} around day {event.day}</p></div><button style={styles.secondaryInlineBtn} type="button" onClick={() => onNotBill(event)} disabled={busyKey === (event.key || getEventMatchText(event))}>{busyKey === (event.key || getEventMatchText(event)) ? "Saving..." : "Not a bill"}</button></div>) : <p style={styles.emptyText}>No bills found yet.</p>}</div>;
}

function MissingBillsPanel({ candidates, styles, busyKey, onConfirm, onClose }) {
  return <div style={panelStyle()}><div style={panelHeaderStyle()}><div><strong>Bills missing?</strong><p style={styles.transactionMeta}>These payments look like they could be bills. Confirm only the ones you actually want in Calendar.</p></div><button style={styles.ghostBtn} type="button" onClick={onClose}>Close</button></div>{candidates.length ? candidates.map((candidate) => <div key={candidate.key} style={compactRowStyle()}><div><strong>{candidate.label}</strong><p style={styles.transactionMeta}>Usually {formatCurrency(candidate.amount)} around day {candidate.day}. Seen {candidate.count} time{candidate.count === 1 ? "" : "s"}. Example: {candidate.example}</p></div><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><button style={styles.secondaryInlineBtn} type="button" disabled={busyKey === candidate.key} onClick={() => onConfirm(candidate, candidate.suggestedCategory || "Major bill")}>{busyKey === candidate.key ? "Saving..." : candidate.suggestedCategory || "Bill"}</button><button style={styles.secondaryInlineBtn} type="button" disabled={busyKey === candidate.key} onClick={() => onConfirm(candidate, "Subscription")}>Sub</button><button style={styles.secondaryInlineBtn} type="button" disabled={busyKey === candidate.key} onClick={() => onConfirm(candidate, "Phone")}>Phone</button><button style={styles.secondaryInlineBtn} type="button" disabled={busyKey === candidate.key} onClick={() => onConfirm(candidate, "Broadband")}>Broadband</button><button style={styles.secondaryInlineBtn} type="button" disabled={busyKey === candidate.key} onClick={() => onConfirm(candidate, "Energy")}>Energy</button></div></div>) : <p style={styles.emptyText}>No strong missing bill candidates found. Add more months or use Checks when a payment appears there.</p>}</div>;
}

function TransactionRow({ name, meta, amount, styles }) {
  return <div style={styles.transactionRow}><div><strong>{name}</strong><p style={styles.transactionMeta}>{meta}</p></div><strong style={{ color: amount < 0 ? "#dc2626" : "#059669" }}>{amount < 0 ? "-" : "+"}{formatCurrency(Math.abs(amount))}</strong></div>;
}

function getPlainMatchLabel(confidenceLabel) {
  return confidenceLabel === "high" ? "strong match" : "good match";
}

function getEventMatchText(event) {
  return cleanBillName(event?.title || "")
    .toLowerCase()
    .replace(/\bbill around\b/g, " ")
    .replace(/\baround\b/g, " ")
    .replace(/£?\d+(\.\d{1,2})?/g, " ")
    .replace(/\bbill\b/g, " ")
    .replace(/\bsubscription\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMissingBillCandidates(transactions = [], events = []) {
  const existingText = normalizeText(events.map((event) => event.title).join(" "));
  const groups = new Map();
  (transactions || []).forEach((transaction) => {
    const amount = Math.abs(Number(transaction.amount || 0));
    if (Number(transaction.amount || 0) >= 0 || amount < 2) return;
    if (transaction._smart_internal_transfer || transaction.is_internal_transfer) return;
    const text = normalizeText(`${transaction.description || ""} ${transaction.category || ""} ${transaction._smart_category || ""}`);
    if (!looksLikePossibleBill(text, amount)) return;
    const matchText = cleanCandidateText(transaction.description);
    if (!matchText || existingText.includes(normalizeText(matchText))) return;
    const date = new Date(transaction.transaction_date);
    if (Number.isNaN(date.getTime())) return;
    const amountBand = amount < 80 ? Math.round(amount / 5) * 5 : Math.round(amount / 10) * 10;
    const key = `${matchText}:${amountBand}`;
    const group = groups.get(key) || { key, matchText, label: niceCandidateName(matchText), amounts: [], days: [], examples: [], count: 0, suggestedCategory: suggestCategory(text) };
    group.amounts.push(amount);
    group.days.push(date.getDate());
    group.examples.push(transaction.description);
    group.count += 1;
    groups.set(key, group);
  });
  return [...groups.values()]
    .map((group) => ({ ...group, amount: usual(group.amounts), day: mode(group.days), example: group.examples[0] }))
    .filter((group) => group.count >= 2 || /eon|e\.on|ee|bt|virgin|sky|vodafone|o2|three|octopus|british gas|edf|shell energy|water|council|insurance|premium funding/.test(normalizeText(group.matchText)))
    .sort((a, b) => b.count - a.count || b.amount - a.amount)
    .slice(0, 12);
}

function looksLikePossibleBill(text, amount) {
  if (/mcdonald|takeaway|restaurant|greggs|uber eats|just eat|chickie|odeon|cinema|gaming|lvl up|xsolla|cash withdrawal|atm|tesco|aldi|lidl|sainsbury|asda|morrisons|one stop|premier/.test(text)) return false;
  if (/eon|e\.on|energy|electric|gas|octopus|british gas|edf|water|ee|vodafone|o2|three|bt|virgin|sky|broadband|phone|mobile|insurance|premium funding|clearpay|klarna|loan|finance|council|tax|rent|landlord|subscription|netflix|apple|google|openai|spotify/.test(text)) return true;
  return amount >= 25 && amount <= 500 && /direct debit|dd|standing order|so|payment/.test(text);
}

function suggestCategory(text) {
  if (/eon|e\.on|energy|electric|gas|octopus|british gas|edf/.test(text)) return "Energy";
  if (/broadband|bt|virgin|sky/.test(text)) return "Broadband";
  if (/phone|mobile|ee|vodafone|o2|three/.test(text)) return "Phone";
  if (/insurance|premium funding/.test(text)) return "Insurance";
  if (/rent|landlord/.test(text)) return "Rent";
  if (/netflix|spotify|apple|google|openai|subscription/.test(text)) return "Subscription";
  return "Major bill";
}

function cleanCandidateText(value) {
  return normalizeText(value)
    .replace(/\b(direct debit|standing order|faster payment|card payment|payment to|payment from|reference|ref|dd|so|pos|visa)\b/g, " ")
    .replace(/\b[a-z]*\d{4,}[a-z0-9]*\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 4)
    .join(" ");
}

function niceCandidateName(value) {
  return cleanCandidateText(value).split(" ").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") || "Possible bill";
}

function usual(values) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!safe.length) return 0;
  return Math.round(safe[Math.floor(safe.length / 2)] * 100) / 100;
}

function mode(values) {
  const counts = values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map());
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] || 1;
}

function dedupeEvents(events = []) {
  const seen = new Set();
  return events.filter((event) => {
    const key = `${getEventMatchText(event)}:${Math.round(Math.abs(Number(event.amount || 0)) * 100)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summaryButtonStyle() {
  return { border: 0, borderRadius: 18, background: "rgba(255,255,255,0.86)", boxShadow: "0 14px 35px rgba(15, 23, 42, 0.06)", padding: 16, display: "grid", gap: 8, textAlign: "left", color: "#0f172a", cursor: "pointer" };
}

function panelStyle() {
  return { border: "1px solid rgba(148,163,184,.22)", borderRadius: 22, padding: 14, margin: "12px 0", background: "rgba(248,250,252,.9)", display: "grid", gap: 10 };
}

function panelHeaderStyle() {
  return { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" };
}

function compactRowStyle() {
  return { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", border: "1px solid rgba(148,163,184,.2)", borderRadius: 16, padding: 12, background: "white" };
}
