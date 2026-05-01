import { useMemo, useState } from "react";
import { supabase } from "../supabase";
import { InsightCard, MiniCard, Section } from "../components/ui";
import {
  addDays,
  formatCompactCurrency,
  formatCurrency,
  formatDateLong,
  getMeaningfulCategory,
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

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPage({ transactions, moneyUnderstanding, screenWidth, styles, helpers }) {
  const { getDataFreshness } = helpers;

  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDayKey, setSelectedDayKey] = useState("");
  const [calendarMode, setCalendarMode] = useState("recurring");
  const [timeframe, setTimeframe] = useState("all");
  const [calendarAiBusy, setCalendarAiBusy] = useState(false);
  const [calendarAiText, setCalendarAiText] = useState("");
  const [calendarAiError, setCalendarAiError] = useState("");

  const recurringEvents = useMemo(
    () => moneyUnderstanding?.recurringEvents || [],
    [moneyUnderstanding]
  );
  const allHistoryMonths = useMemo(
    () => getMonthlyBreakdown(transactions, "all"),
    [transactions]
  );
  const availableMonthCount = allHistoryMonths.length;
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

        {availableMonthCount <= 1 && !shortTimeframe && calendarMode === "history" ? <p style={styles.calendarRangeHint}>You have one month of history so far. Add more statements to make patterns smarter.</p> : null}

        {calendarMode === "recurring" ? (
          <div style={getCalendarSummaryGridStyle(screenWidth)}>
            <MiniCard styles={styles} title="Bills this month" value={formatCurrency(recurringMonthTotal)} />
            <MiniCard styles={styles} title="Bills found" value={`${recurringMonthEvents.length}`} />
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
            {calendarMode === "history" ? (selectedDay.transactions.length === 0 ? <p style={styles.emptyText}>{selectedDay.isFutureDay ? "This day has not happened yet." : "Nothing landed on this day."}</p> : <><p style={styles.transactionMeta}>{selectedDay.transactions.length} transaction{selectedDay.transactions.length === 1 ? "" : "s"}. In {formatCurrency(selectedDay.earned)}. Out {formatCurrency(selectedDay.spent)}. Left {selectedDay.net >= 0 ? "+" : "-"}{formatCurrency(Math.abs(selectedDay.net))}</p>{selectedDay.transactions.map((transaction) => <TransactionRow styles={styles} key={transaction.id || `${transaction.transaction_date}-${transaction.description}-${transaction.amount}`} name={transaction.description || "Transaction"} meta={getMeaningfulCategory(transaction) || "Uncategorised"} amount={Number(transaction.amount || 0)} />)}</>) : !selectedDay.events.length ? <p style={styles.emptyText}>Nothing is expected on this date.</p> : selectedDay.events.map((event) => <div key={event.key} style={styles.signalCard}><div style={styles.signalHeader}><div><strong>{event.title}</strong><p style={styles.transactionMeta}>Expected around day {event.day} - {event.kindLabel} - {getPlainMatchLabel(event.confidenceLabel)}</p>{event.estimateNote ? <p style={styles.transactionMeta}>{event.estimateNote}</p> : null}</div><strong>{event.amount > 0 ? "+" : "-"}{formatCurrency(Math.abs(event.amount))}</strong></div><div style={styles.inlineBtnRow}><button style={styles.primaryInlineBtn} onClick={() => downloadCalendarEvent(event)}>Add to Google / Apple Calendar</button></div></div>)}
          </div>
        ) : null}
      </Section>

      <Section styles={styles} title="What Stands Out" right={<button type="button" style={styles.ghostBtn} onClick={runCalendarAiAnalysis} disabled={calendarAiBusy}>{calendarAiBusy ? "Checking..." : "Ask AI"}</button>}>
        <InsightCard styles={styles} label={calendarAiText ? "AI answer" : "Quick read"} headline={calendarAiText ? `Read for ${timeframeLabel}` : calendarMode === "recurring" ? "Upcoming bill pressure" : patternSummary.headline} body={calendarAiText || (calendarMode === "recurring" ? recurringMonthEvents.length ? `Money Hub expects ${recurringMonthEvents.length} future bill/payment${recurringMonthEvents.length === 1 ? "" : "s"} this month, totalling about ${formatCurrency(recurringMonthTotal)}. Estimates improve as you add more months and answer Checks.` : "No future bills found yet. Add more history or answer Checks when they appear." : patternSummary.body)} />
        {calendarAiError ? <p style={styles.errorNote}>{calendarAiError}</p> : null}
      </Section>

      <Section styles={styles} title={monthlyBreakdown.length <= 1 ? "This Month" : "Recent Months"}>
        {monthlyBreakdown.length === 0 ? <p style={styles.emptyText}>Add more history to see month-by-month spending.</p> : monthlyBreakdown.length === 1 ? <div style={styles.daySummaryCard}><strong>{monthlyBreakdown[0].label}</strong><p style={styles.transactionMeta}>Money in {formatCurrency(monthlyBreakdown[0].earned)}. Money out {formatCurrency(monthlyBreakdown[0].spent)}. Used on {monthlyBreakdown[0].activeDays} day{monthlyBreakdown[0].activeDays === 1 ? "" : "s"}.</p><p style={{ ...styles.transactionMeta, color: monthlyBreakdown[0].net >= 0 ? "#059669" : "#dc2626", marginTop: "8px" }}>Overall this month: {monthlyBreakdown[0].net >= 0 ? "+" : "-"}{formatCurrency(Math.abs(monthlyBreakdown[0].net))}</p></div> : monthlyBreakdown.map((month) => <div key={month.key} style={styles.monthTrendRow}><div><strong>{month.label}</strong><p style={styles.transactionMeta}>In {formatCurrency(month.earned)}. Out {formatCurrency(month.spent)}. Used on {month.activeDays} day{month.activeDays === 1 ? "" : "s"}</p></div><strong style={{ color: month.net >= 0 ? "#059669" : "#dc2626" }}>{month.net >= 0 ? "+" : "-"}{formatCurrency(Math.abs(month.net))}</strong></div>)}
      </Section>
    </>
  );
}

function TransactionRow({ name, meta, amount, styles }) {
  return <div style={styles.transactionRow}><div><strong>{name}</strong><p style={styles.transactionMeta}>{meta}</p></div><strong style={{ color: amount < 0 ? "#dc2626" : "#059669" }}>{amount < 0 ? "-" : "+"}{formatCurrency(Math.abs(amount))}</strong></div>;
}

function getPlainMatchLabel(confidenceLabel) {
  return confidenceLabel === "high" ? "strong match" : "good match";
}
