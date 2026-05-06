import { useMemo, useState } from "react";
import { supabase } from "../supabase";
import { InsightCard, Section } from "../components/ui";
import SetupEmptyState from "../components/SetupEmptyState";
import { formatCurrency, normalizeText } from "../lib/finance";
import {
  downloadCalendarEvent,
  getMonthlyBreakdown,
} from "../lib/calendarIntelligence";
import {
  buildCalendarMonthlyRows,
  getMonthStandout,
} from "../lib/calendarMoneyPresentation";
import { cleanBillName, getBillBaseName } from "../lib/moneyUnderstandingGuards";

export default function CalendarPage({
  transactions,
  transactionRules = [],
  moneyUnderstanding,
  appMoneyModel,
  reviewChecks = null,
  onTransactionRulesChange,
  onRefreshMoneyUnderstanding,
  onNavigate,
  screenWidth,
  styles,
}) {
  const [correctionBusyKey, setCorrectionBusyKey] = useState("");
  const [calendarNotice, setCalendarNotice] = useState("");
  const [showMissingBills, setShowMissingBills] = useState(false);
  const [showHiddenSuggestions, setShowHiddenSuggestions] = useState(false);
  const [hiddenCandidateKeys, setHiddenCandidateKeys] = useState([]);
  const [confirmedCandidateKeys, setConfirmedCandidateKeys] = useState([]);

  const recurringEvents = useMemo(
    () => dedupeEvents((moneyUnderstanding?.recurringEvents || [])
      .map((event) => ({ ...event, title: cleanBillName(event.title) }))),
    [moneyUnderstanding]
  );
  const missingBillCandidates = useMemo(
    () => getMissingBillCandidates(transactions, recurringEvents, transactionRules),
    [transactions, recurringEvents, transactionRules]
  );
  const visibleMissingBillCandidates = useMemo(
    () => missingBillCandidates.filter((candidate) => !hiddenCandidateKeys.includes(candidate.key) && !confirmedCandidateKeys.includes(candidate.key)),
    [missingBillCandidates, hiddenCandidateKeys, confirmedCandidateKeys]
  );
  const hiddenSuggestionRules = useMemo(
    () => dedupeHiddenSuggestionRules(transactionRules || []),
    [transactionRules]
  );
  const sharedContributions = useMemo(
    () => appMoneyModel?.sharedBillContributions?.confirmed || [],
    [appMoneyModel?.sharedBillContributions]
  );
  const sharedContributionsToCheck = useMemo(
    () => appMoneyModel?.sharedBillContributions?.needsChecking || [],
    [appMoneyModel?.sharedBillContributions]
  );
  const sharedBillMoney = Number(appMoneyModel?.monthlySharedContributionTotal || appMoneyModel?.sharedBillContributions?.monthlyTotal || 0);
  const grossMonthlyBillTotal = Number(appMoneyModel?.grossMonthlyBillTotal || 0);
  const personalBillTotal = Number(appMoneyModel?.monthlyBillBurdenTotal ?? appMoneyModel?.monthlyBillTotal ?? 0);
  const reviewCheckCount = reviewChecks?.length ?? appMoneyModel?.checksWaiting?.length ?? 0;

  const upcomingBills = useMemo(
    () => buildUpcomingBillRows({
      upcomingBills: appMoneyModel?.upcomingBills,
      recurringEvents,
      sharedContributions,
      sharedContributionsToCheck,
    }),
    [appMoneyModel?.upcomingBills, recurringEvents, sharedContributions, sharedContributionsToCheck]
  );
  const nextBill = upcomingBills[0] || null;
  const rawMonthlyBreakdown = useMemo(
    () => getMonthlyBreakdown(transactions, "all").slice(0, 6),
    [transactions]
  );
  const monthlyRows = useMemo(
    () => buildCalendarMonthlyRows({
      cleanRows: appMoneyModel?.cleanMonthlyFacts?.monthly_rows,
      rawRows: rawMonthlyBreakdown,
      timeframe: "all",
    }),
    [appMoneyModel?.cleanMonthlyFacts?.monthly_rows, rawMonthlyBreakdown]
  );
  const standout = getMonthStandout({
    monthlyRows,
    cleanFacts: appMoneyModel?.cleanMonthlyFacts,
    sharedBillContributions: appMoneyModel?.sharedBillContributions,
    missingBillCount: visibleMissingBillCandidates.length,
  });
  const heroRead = getCalendarHeroRead({
    nextBill,
    personalBillTotal,
    grossMonthlyBillTotal,
    sharedBillMoney,
    missingBillCount: visibleMissingBillCandidates.length,
    reviewCheckCount,
    sharedContributionsToCheck,
  });

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
      await saveCalendarRule({
        matchText,
        amount: event.grossAmount || event.amount,
        category: "Ignore for Calendar",
        isBill: false,
        isSubscription: false,
        notes: `User marked ${event.name || event.title} as not a bill from Calendar.`,
      });
      await onRefreshMoneyUnderstanding?.();
      setCalendarNotice(`${event.name || event.title} removed from Calendar. Calendar is refreshing.`);
    } catch (error) {
      setCalendarNotice(error.message || "Could not save that correction yet.");
    } finally {
      setCorrectionBusyKey("");
    }
  }

  async function markCandidateAsBill(candidate, category) {
    setConfirmedCandidateKeys((keys) => [...new Set([...keys, candidate.key])]);
    setCorrectionBusyKey(candidate.key);
    setCalendarNotice(`Saving ${candidate.label} as ${category}...`);
    try {
      const isSubscription = category === "Subscription";
      await saveCalendarRule({
        matchText: candidate.matchText,
        amount: candidate.amount,
        category,
        isBill: !isSubscription,
        isSubscription,
        notes: `User confirmed missing Calendar item as ${category}. Example: ${candidate.example}`,
      });
      await onRefreshMoneyUnderstanding?.();
      setCalendarNotice(`Added ${candidate.label} as ${category}. Calendar is refreshing.`);
    } catch (error) {
      setConfirmedCandidateKeys((keys) => keys.filter((key) => key !== candidate.key));
      setCalendarNotice(error.message || `Could not save ${candidate.label}. Try again.`);
    } finally {
      setCorrectionBusyKey("");
    }
  }

  async function hideMissingBillCandidate(candidate) {
    setHiddenCandidateKeys((keys) => [...new Set([...keys, candidate.key])]);
    setCorrectionBusyKey(candidate.key);
    setCalendarNotice(`Removing ${candidate.label} from Calendar suggestions...`);
    try {
      await saveCalendarRule({
        matchText: candidate.matchText,
        amount: candidate.amount,
        category: "Ignore for Calendar",
        isBill: false,
        isSubscription: false,
        notes: `User marked ${candidate.label} as not a bill from Calendar suggestions. Example: ${candidate.example}`,
      });
      await onRefreshMoneyUnderstanding?.();
      setCalendarNotice(`${candidate.label} removed from Calendar suggestions.`);
    } catch (error) {
      setHiddenCandidateKeys((keys) => keys.filter((key) => key !== candidate.key));
      setCalendarNotice(error.message || `Could not remove ${candidate.label}. Try again.`);
    } finally {
      setCorrectionBusyKey("");
    }
  }

  async function restoreHiddenSuggestion(rule) {
    const matchText = rule.match_text || "";
    const niceName = niceCandidateName(matchText);
    const restoreKey = `restore-${rule.id || matchText}`;

    setCorrectionBusyKey(restoreKey);
    setCalendarNotice(`Restoring ${niceName}...`);

    try {
      let query = supabase.from("transaction_rules").delete();

      if (rule.id) {
        query = query.eq("id", rule.id);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        query = query
          .eq("user_id", user.id)
          .eq("rule_type", "calendar_suppression")
          .eq("match_text", matchText);

        if (rule.match_amount != null) {
          query = query.eq("match_amount", rule.match_amount);
        }
      }

      const { error } = await query;
      if (error) throw error;

      const providerKey = getProviderKey(matchText);

      setHiddenCandidateKeys((keys) =>
        keys.filter((key) => !normalizeText(key).includes(providerKey))
      );

      await onTransactionRulesChange?.();
      await onRefreshMoneyUnderstanding?.();

      setCalendarNotice(`${niceName} restored. Check possible bills again.`);
      setShowHiddenSuggestions(false);
      setShowMissingBills(true);
    } catch (error) {
      setCalendarNotice(error.message || `Could not restore ${niceName}. Try again.`);
    } finally {
      setCorrectionBusyKey("");
    }
  }

  if (!transactions.length) {
    return (
      <SetupEmptyState
        title="Calendar"
        label="Future bills"
        headline="Upload statements to build your bill calendar"
        body="Money Hub needs real statement history before it can predict rent, bills, subscriptions and quiet days without guessing."
        primaryAction={{ label: "Upload statements", onClick: () => onNavigate?.("upload") }}
        secondaryAction={{ label: "Open Review", onClick: () => onNavigate?.("confidence") }}
        cards={[
          {
            label: "First unlock",
            headline: "One month gives a first read",
            body: "The calendar can start showing real spending days and obvious regular payments.",
          },
          {
            label: "Best unlock",
            headline: "Three months makes it useful",
            body: "Repeated bills, income rhythm and subscriptions become much easier to trust.",
          },
        ]}
        styles={styles}
      />
    );
  }

  return (
    <>
      <CalendarHeader screenWidth={screenWidth} />
      <CalendarHero
        read={heroRead}
        screenWidth={screenWidth}
        onPrimary={() => {
          if (sharedContributionsToCheck.length) {
            onNavigate?.("confidence");
            return;
          }
          if (visibleMissingBillCandidates.length) {
            setShowMissingBills(true);
            return;
          }
          onNavigate?.("confidence");
        }}
      />

      <Section
        styles={styles}
        title="Upcoming Bills"
        right={
          <div style={getSmallActionRowStyle()}>
            <button type="button" style={styles.ghostBtn} onClick={() => setShowMissingBills((open) => !open)}>
              Possible bills
            </button>
            <button type="button" style={styles.ghostBtn} onClick={() => setShowHiddenSuggestions((open) => !open)}>
              Hidden
            </button>
          </div>
        }
      >
        {calendarNotice ? <p style={{ ...styles.calendarRangeHint, color: calendarNotice.toLowerCase().includes("could not") ? "#dc2626" : "#2563eb" }}>{calendarNotice}</p> : null}
        {upcomingBills.length ? (
          <div style={getSimpleListStyle()}>
            {upcomingBills.slice(0, 8).map((bill) => (
              <UpcomingBillRow
                key={bill.key}
                bill={bill}
                styles={styles}
                busyKey={correctionBusyKey}
                onAddToCalendar={() => downloadCalendarEvent(toCalendarEvent(bill))}
                onNotBill={() => markEventNotBill(bill)}
              />
            ))}
          </div>
        ) : (
          <p style={styles.emptyText}>No confident regular bills yet. Answer Review checks or upload more history so Money Hub can separate bills from normal spending.</p>
        )}

        {showMissingBills ? (
          <MissingBillsPanel
            candidates={visibleMissingBillCandidates}
            styles={styles}
            busyKey={correctionBusyKey}
            onConfirm={markCandidateAsBill}
            onHide={hideMissingBillCandidate}
            onClose={() => setShowMissingBills(false)}
          />
        ) : null}
        {showHiddenSuggestions ? (
          <HiddenSuggestionsPanel
            rules={hiddenSuggestionRules}
            styles={styles}
            busyKey={correctionBusyKey}
            onRestore={restoreHiddenSuggestion}
            onClose={() => setShowHiddenSuggestions(false)}
          />
        ) : null}
      </Section>

      <Section styles={styles} title="What Stands Out">
        <InsightCard
          styles={styles}
          label={standout.label}
          headline={standout.headline}
          body={standout.body}
        />
      </Section>

      <Section styles={styles} title={monthlyRows.length <= 1 ? "This Month" : "Recent Months"}>
        {monthlyRows.length === 0 ? (
          <p style={styles.emptyText}>Add more history to see month-by-month pressure.</p>
        ) : (
          <div style={getSimpleListStyle()}>
            {monthlyRows.map((month) => <MonthTrendRow key={month.key} month={month} styles={styles} />)}
          </div>
        )}
      </Section>
    </>
  );
}

function CalendarHeader({ screenWidth }) {
  return (
    <header style={getCalendarHeaderStyle(screenWidth)}>
      <h2 style={getCalendarHeaderTitleStyle(screenWidth)}>Calendar</h2>
      <p style={getCalendarHeaderSubtitleStyle()}>Bills and monthly pressure</p>
    </header>
  );
}

function CalendarHero({ read, screenWidth, onPrimary }) {
  return (
    <section style={getCalendarHeroStyle(screenWidth, read.tone)}>
      <div style={getCalendarHeroTopStyle(screenWidth)}>
        <div>
          <p style={getCalendarHeroEyebrowStyle()}>{read.eyebrow}</p>
          <h2 style={getCalendarHeroTitleStyle(screenWidth)}>{read.headline}</h2>
          <p style={getCalendarHeroBodyStyle()}>{read.body}</p>
        </div>
        <div style={getCalendarHeroStatusStyle(read.tone)}>
          <span>{read.statusLabel}</span>
          <strong>{read.statusValue}</strong>
          <small>{read.statusDetail}</small>
        </div>
      </div>
      <div style={getCalendarHeroMetricGridStyle(screenWidth)}>
        {read.metrics.map((metric) => <CalendarHeroMetric key={metric.label} metric={metric} />)}
      </div>
      <div style={getCalendarHeroActionRowStyle()}>
        <button type="button" style={getCalendarHeroPrimaryButtonStyle(read.tone)} onClick={onPrimary}>
          {read.primaryLabel}
        </button>
      </div>
    </section>
  );
}

function CalendarHeroMetric({ metric }) {
  return (
    <div style={getCalendarHeroMetricStyle(metric.tone)}>
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <small>{metric.detail}</small>
    </div>
  );
}

function UpcomingBillRow({ bill, styles, busyKey, onAddToCalendar, onNotBill }) {
  const isBusy = busyKey === (bill.key || getEventMatchText(bill));
  return (
    <div style={getBillRowStyle(bill.needsChecking)}>
      <div style={{ minWidth: 0 }}>
        <strong>{bill.name}</strong>
        <p style={styles.transactionMeta}>{bill.dueLabel}</p>
        {bill.needsChecking ? <p style={styles.transactionMeta}>Shared money may be affecting this bill. Confirm in Review.</p> : null}
      </div>
      <div style={getBillRowRightStyle()}>
        <span style={getAmountLabelStyle()}>{bill.needsChecking ? "Needs checking" : "Your share"}</span>
        <strong style={getBillAmountStyle(bill.needsChecking)}>{bill.needsChecking ? "Review" : formatCurrency(bill.userShare)}</strong>
        {bill.grossAmount !== bill.userShare || bill.needsChecking ? <small style={styles.transactionMeta}>{formatCurrency(bill.grossAmount)} total bill</small> : null}
        <div style={getRowActionStyle()}>
          <button type="button" style={styles.secondaryInlineBtn} onClick={onAddToCalendar}>Add</button>
          <button type="button" style={styles.secondaryInlineBtn} disabled={isBusy} onClick={onNotBill}>
            {isBusy ? "Saving..." : "Not a bill"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MonthTrendRow({ month, styles }) {
  const needsChecking = month.status === "needs_checking";
  return (
    <div style={getMonthRowStyle(needsChecking)}>
      <div style={{ minWidth: 0 }}>
        <strong>{month.label}</strong>
        <p style={styles.transactionMeta}>{month.detailLabel}</p>
        {month.warning ? <p style={styles.transactionMeta}>{month.warning}</p> : null}
      </div>
      <div style={getMonthAmountWrapStyle()}>
        <span style={getAmountLabelStyle()}>{month.valueLabel}</span>
        <strong style={{ color: needsChecking ? "#b45309" : month.net >= 0 ? "#047857" : "#b91c1c" }}>
          {month.amountText}
        </strong>
      </div>
    </div>
  );
}

function getCalendarHeroRead({
  nextBill,
  personalBillTotal,
  grossMonthlyBillTotal,
  sharedBillMoney,
  missingBillCount,
  reviewCheckCount = 0,
  sharedContributionsToCheck,
}) {
  const needsSharedCheck = sharedContributionsToCheck.length > 0;
  const reviewMetric = getReviewMetric({ reviewCheckCount, missingBillCount });

  if (needsSharedCheck) {
    return {
      tone: "warn",
      eyebrow: "Needs checking",
      headline: nextBill ? `${nextBill.name} may be shared` : "Shared bill money needs a check",
      body: "Calendar can see possible rent or bill contribution money, so it will not pretend the full result is certain.",
      statusLabel: "Review",
      statusValue: "Needs checking",
      statusDetail: "Confirm shared money",
      primaryLabel: "Open Review",
      metrics: [
        { label: "To cover", value: formatCurrency(personalBillTotal || grossMonthlyBillTotal), detail: "Before uncertain shared money", tone: "warn" },
        { label: "Next bill", value: nextBill ? nextBill.name : "None found", detail: nextBill?.dueLabel || "Needs more data", tone: "focus" },
        reviewMetric,
      ],
    };
  }

  if (!nextBill) {
    return {
      tone: "empty",
      eyebrow: "Forward look",
      headline: "No confident bills found yet",
      body: "A blank bill calendar usually means the data is too thin. Review possible bills or upload more history.",
      statusLabel: "To cover",
      statusValue: formatCurrency(personalBillTotal),
      statusDetail: missingBillCount ? `${missingBillCount} possible bill${missingBillCount === 1 ? "" : "s"}` : "No regular payments found",
      primaryLabel: missingBillCount ? "Check possible bills" : "Open Review",
      metrics: [
        { label: "Your share", value: formatCurrency(personalBillTotal), detail: "Known bills", tone: "neutral" },
        { label: "Next bill", value: "None found", detail: "Needs more data", tone: "neutral" },
        reviewMetric,
      ],
    };
  }

  return {
    tone: "focus",
    eyebrow: "Next bill",
    headline: `Next up: ${nextBill.name}`,
    body: nextBill.grossAmount !== nextBill.userShare
      ? `${formatCurrency(nextBill.grossAmount)} total bill, with shared money expected. Keep ${formatCurrency(nextBill.userShare)} covered.`
      : `Keep ${formatCurrency(nextBill.userShare)} covered for this payment. Calendar is using bills Money Hub is confident about.`,
    statusLabel: "Your share to cover",
    statusValue: formatCurrency(nextBill.userShare),
    statusDetail: nextBill.grossAmount !== nextBill.userShare ? `${formatCurrency(nextBill.grossAmount)} total bill` : nextBill.dueLabel,
    primaryLabel: missingBillCount ? "Check possible bills" : "Open Review",
    metrics: [
      { label: "Monthly cover", value: formatCurrency(personalBillTotal), detail: sharedBillMoney > 0 ? "Your share estimate" : "Expected bills", tone: personalBillTotal > 0 ? "bad" : "neutral" },
      { label: "Shared money", value: sharedBillMoney > 0 ? formatCurrency(sharedBillMoney) : "None found", detail: sharedBillMoney > 0 ? "Excluded from income" : "No regular contribution", tone: sharedBillMoney > 0 ? "good" : "neutral" },
      reviewMetric,
    ],
  };
}

function getReviewMetric({ reviewCheckCount = 0, missingBillCount = 0 }) {
  if (reviewCheckCount > 0) {
    return {
      label: "Review",
      value: `${reviewCheckCount} to answer`,
      detail: "Checks waiting",
      tone: "warn",
    };
  }

  if (missingBillCount > 0) {
    return {
      label: "Review",
      value: `${missingBillCount}`,
      detail: "Possible bills",
      tone: "warn",
    };
  }

  return {
    label: "Review",
    value: "Clear",
    detail: "No checks waiting",
    tone: "good",
  };
}

function buildUpcomingBillRows({ upcomingBills = [], recurringEvents = [], sharedContributions = [], sharedContributionsToCheck = [] }) {
  const source = Array.isArray(upcomingBills) && upcomingBills.length
    ? upcomingBills
    : (recurringEvents || []).map((event) => ({
        key: event.key,
        name: event.title || event.name,
        amount: Math.abs(Number(event.amount || 0)),
        day: event.day,
        kind: event.kind,
        confidence: event.confidenceLabel,
      }));

  return dedupeUpcomingBills(source.map((item) => {
    const grossAmount = Math.abs(Number(item.amount || 0));
    const due = item.date ? getDateRead(item.date) : getNextDateRead(item.day);
    const share = getSharedAdjustedBillAmount(item, sharedContributions);
    const needsChecking = hasSharedContributionCheck(item, sharedContributionsToCheck);
    return {
      key: item.key || `${getBillBaseName(item.name || item.title)}:${grossAmount}:${item.day || due.day}`,
      name: cleanBillName(item.name || item.title || "Bill"),
      grossAmount,
      userShare: needsChecking ? grossAmount : share.amount,
      day: item.day || due.day,
      date: due.iso,
      daysAway: due.daysAway,
      dueLabel: due.label,
      kind: item.kind || "bill",
      confidenceLabel: item.confidence || item.confidenceLabel || "medium",
      needsChecking,
    };
  }))
    .filter((bill) => bill.grossAmount > 0)
    .sort((a, b) => a.daysAway - b.daysAway || b.grossAmount - a.grossAmount);
}

function getSharedAdjustedBillAmount(bill, sharedContributions = []) {
  const grossAmount = Math.abs(Number(bill.amount || bill.grossAmount || 0));
  const billKey = String(bill.key || "");
  const billName = String(bill.name || bill.title || "");
  const contribution = (sharedContributions || []).find((item) => {
    const keyMatches = item.matchedBillKey && billKey && String(item.matchedBillKey) === billKey;
    const nameMatches = item.matchedBillName && billName && normalizeText(item.matchedBillName) === normalizeText(billName);
    return keyMatches || nameMatches;
  });
  const contributionAmount = Math.abs(Number(contribution?.appliedMonthlyAmount || 0));
  if (!grossAmount || !contributionAmount) return { amount: grossAmount, grossAmount, hasShare: false };
  return { amount: Math.max(grossAmount - contributionAmount, 0), grossAmount, hasShare: true };
}

function hasSharedContributionCheck(bill, contributions = []) {
  const billKey = String(bill.key || "");
  const billName = String(bill.name || bill.title || "");
  return (contributions || []).some((item) => {
    const keyMatches = item.matchedBillKey && billKey && String(item.matchedBillKey) === billKey;
    const nameMatches = item.matchedBillName && billName && normalizeText(item.matchedBillName) === normalizeText(billName);
    return keyMatches || nameMatches;
  });
}

function dedupeUpcomingBills(bills = []) {
  return bills.reduce((list, bill) => {
    const providerKey = getProviderKey(getBillBaseName(bill.name) || bill.name);
    const amount = Math.abs(Number(bill.grossAmount || 0));
    const day = Number(bill.day || 0);
    const matchIndex = list.findIndex((existing) => {
      const existingProvider = getProviderKey(getBillBaseName(existing.name) || existing.name);
      const existingAmount = Math.abs(Number(existing.grossAmount || 0));
      const existingDay = Number(existing.day || 0);
      return providerKey && existingProvider && providerKey === existingProvider && amountsClose(amount, existingAmount, 0.08, 3) && Math.abs(day - existingDay) <= 4;
    });
    if (matchIndex < 0) return [...list, bill];
    const current = list[matchIndex];
    const better = bill.needsChecking || bill.daysAway < current.daysAway ? bill : current;
    return list.map((item, index) => (index === matchIndex ? better : item));
  }, []);
}

function getDateRead(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return getNextDateRead(1);
  const today = startOfLocalDay(new Date());
  const daysAway = Math.max(Math.round((startOfLocalDay(date) - today) / 86400000), 0);
  return {
    iso: isoDate,
    day: date.getDate(),
    daysAway,
    label: formatDueLabel(date, daysAway),
  };
}

function getNextDateRead(day) {
  const today = startOfLocalDay(new Date());
  const safeDay = Math.max(1, Math.min(Number(day || 1), 28));
  let date = new Date(today.getFullYear(), today.getMonth(), safeDay);
  if (date < today) date = new Date(today.getFullYear(), today.getMonth() + 1, safeDay);
  const daysAway = Math.max(Math.round((date - today) / 86400000), 0);
  return {
    iso: date.toISOString().slice(0, 10),
    day: safeDay,
    daysAway,
    label: formatDueLabel(date, daysAway),
  };
}

function formatDueLabel(date, daysAway) {
  if (daysAway === 0) return "Due today";
  if (daysAway === 1) return "Due tomorrow";
  const dateText = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date);
  return `Due ${dateText}`;
}

function startOfLocalDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toCalendarEvent(bill) {
  return {
    key: bill.key,
    title: bill.name,
    amount: -Math.abs(Number(bill.grossAmount || 0)),
    day: bill.day,
    kind: bill.kind,
    kindLabel: bill.kind === "subscription" ? "Subscription" : "Bill",
    confidenceLabel: bill.confidenceLabel || "medium",
  };
}

function MissingBillsPanel({ candidates, styles, busyKey, onConfirm, onHide, onClose }) {
  const categoryButtons = ["Bill", "Subscription", "Phone", "Broadband", "Energy"];
  return (
    <div style={styles.calendarCorrectionPanel}>
      <div style={styles.calendarCorrectionHeader}>
        <div>
          <strong>Check possible missing bills</strong>
          <p style={styles.transactionMeta}>These payments might be bills. Pick the right type, or remove anything that is not a bill.</p>
        </div>
        <button style={styles.ghostBtn} type="button" onClick={onClose}>Close</button>
      </div>
      {candidates.length ? candidates.map((candidate) => (
        <div key={candidate.key} style={styles.calendarCorrectionRow}>
          <div>
            <strong>{candidate.label}</strong>
            <p style={styles.transactionMeta}>
              Usually {formatCurrency(candidate.amount)} around day {candidate.day}. Seen {candidate.count} time{candidate.count === 1 ? "" : "s"}.
            </p>
            <p style={styles.transactionMeta}>Example: {candidate.example}</p>
          </div>
          <div style={styles.calendarCorrectionButtons}>
            {categoryButtons.map((category) => (
              <button key={category} style={styles.secondaryInlineBtn} type="button" disabled={busyKey === candidate.key} onClick={() => onConfirm(candidate, category)}>
                {busyKey === candidate.key ? "Saving..." : category}
              </button>
            ))}
            <button style={styles.secondaryInlineBtn} type="button" disabled={busyKey === candidate.key} onClick={() => onHide(candidate)}>
              {busyKey === candidate.key ? "Saving..." : "Not a bill"}
            </button>
          </div>
        </div>
      )) : <p style={styles.emptyText}>Nothing obvious right now. If Money Hub is unsure later, it will ask you to check.</p>}
    </div>
  );
}

function HiddenSuggestionsPanel({ rules, styles, busyKey, onRestore, onClose }) {
  return (
    <div style={styles.calendarCorrectionPanel}>
      <div style={styles.calendarCorrectionHeader}>
        <div>
          <strong>Hidden suggestions</strong>
          <p style={styles.transactionMeta}>Restore anything you removed by mistake.</p>
        </div>
        <button style={styles.ghostBtn} type="button" onClick={onClose}>Close</button>
      </div>

      {rules.length ? (
        rules.map((rule) => {
          const restoreKey = `restore-${rule.id || rule.match_text}`;
          const name = niceCandidateName(rule.match_text || "");
          const amount = Math.abs(Number(rule.match_amount || 0));

          return (
            <div key={rule.id || `${rule.match_text}-${rule.match_amount || ""}`} style={styles.calendarCorrectionRow}>
              <div>
                <strong>{name}</strong>
                <p style={styles.transactionMeta}>
                  {amount ? `${formatCurrency(amount)} hidden from Calendar suggestions.` : "Hidden from Calendar suggestions."}
                </p>
                {rule.notes ? <p style={styles.transactionMeta}>{shortenHiddenNote(rule.notes)}</p> : null}
              </div>

              <button
                style={styles.secondaryInlineBtn}
                type="button"
                disabled={busyKey === restoreKey}
                onClick={() => onRestore(rule)}
              >
                {busyKey === restoreKey ? "Restoring..." : "Restore"}
              </button>
            </div>
          );
        })
      ) : (
        <p style={styles.emptyText}>Nothing hidden right now.</p>
      )}
    </div>
  );
}

function getMissingBillCandidates(transactions = [], events = [], transactionRules = []) {
  const groups = [];
  (transactions || []).forEach((transaction) => {
    const amount = Math.abs(Number(transaction.amount || 0));
    if (Number(transaction.amount || 0) >= 0 || amount < 2) return;
    if (transaction._smart_internal_transfer || transaction.is_internal_transfer) return;
    const text = normalizeText(`${transaction.description || ""} ${transaction.category || ""} ${transaction._smart_category || ""}`);
    const providerKey = getProviderKey(transaction.description || text);
    if (!providerKey) return;
    if (isSuppressedByCalendarRules({ providerKey, amount }, transactionRules)) return;
    if (!looksLikePossibleBill(text, amount)) return;
    const suggestedCategory = suggestCategory(text);
    if (candidateMatchesExistingBill({ providerKey, amount, suggestedCategory }, events)) return;
    const matchText = cleanCandidateText(transaction.description) || providerKey;
    if (!matchText) return;
    const date = new Date(transaction.transaction_date);
    if (Number.isNaN(date.getTime())) return;
    const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
    const transactionKey = `${monthKey}:${date.getDate()}:${providerKey}:${Math.round(amount * 100)}:${normalizeText(transaction.description)}`;
    let group = groups.find((item) => item.providerKey === providerKey && item.suggestedCategory === suggestedCategory && !isSeparateAmountBand(amount, usual(item.amounts)));
    if (!group) {
      group = { providerKey, matchText, label: niceCandidateName(providerKey), amounts: [], days: [], examples: [], monthKeys: new Set(), seenTransactions: new Set(), count: 0, suggestedCategory };
      groups.push(group);
    }
    if (group.seenTransactions.has(transactionKey)) return;
    group.seenTransactions.add(transactionKey);
    group.amounts.push(amount);
    group.days.push(date.getDate());
    group.examples.push(transaction.description);
    group.monthKeys.add(monthKey);
    group.count += 1;
  });
  return groups
    .map((group) => {
      const amount = usual(group.amounts);
      return {
        key: `${group.providerKey}:${group.suggestedCategory}:${Math.round(amount * 100)}`,
        matchText: group.matchText,
        label: group.label,
        amount,
        day: mode(group.days),
        count: group.count,
        monthCount: group.monthKeys.size,
        example: group.examples[0],
        suggestedCategory: group.suggestedCategory,
      };
    })
    .filter((group) => group.count >= 2 && group.monthCount >= 2)
    .sort((a, b) => b.count - a.count || b.amount - a.amount)
    .slice(0, 12);
}

function looksLikePossibleBill(text, amount) {
  if (/mcdonald|takeaway|restaurant|greggs|uber eats|just eat|chickie|gaming|lvl up|xsolla|cash withdrawal|atm|tesco|aldi|lidl|sainsbury|asda|morrisons|one stop|premier|petrol|fuel|parking|vinted|ebay|amazon marketplace|proovia|mynextbike|trading|investment/.test(text)) return false;
  if (/eon|e\.on|energy|electric|gas|octopus|british gas|edf|water|ee|vodafone|o2|three|bt|virgin|sky|broadband|phone|mobile|insurance|premium funding|clearpay|klarna|loan|finance|council|tax|rent|landlord|subscription|netflix|apple|itunes|icloud|google|openai|spotify|odeon|cinema|cineworld|vue/.test(text)) return true;
  return amount >= 25 && amount <= 500 && /direct debit|dd|standing order|so|payment/.test(text);
}

function suggestCategory(text) {
  if (/eon|e\.on|energy|electric|gas|octopus|british gas|edf/.test(text)) return "Energy";
  if (/broadband|bt|virgin|sky/.test(text)) return "Broadband";
  if (/phone|mobile|ee|vodafone|o2|three/.test(text)) return "Phone";
  if (/netflix|spotify|apple|itunes|icloud|google|openai|subscription|odeon|cinema|cineworld|vue/.test(text)) return "Subscription";
  return "Bill";
}

function cleanCandidateText(value) {
  return getProviderKey(value)
    .split(" ")
    .slice(0, 5)
    .join(" ");
}

function getProviderKey(value) {
  return normalizeText(value)
    .replace(/\b(direct debit|standing order|faster payment|card payment|payment to|payment from|reference|ref|dd|so|pos|visa)\b/g, " ")
    .replace(/\b(debit card|credit card|contactless|online payment|bank giro credit|bacs|fpi|fpo|fp|cr|dr)\b/g, " ")
    .replace(/\b[a-z]*\d{4,}[a-z0-9]*\b/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/[^a-z0-9&\s]/g, " ")
    .replace(/\be\s+on\b/g, "eon")
    .replace(/\b(co uk|com|co|ltd|limited|plc|uk|gb)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
}

function niceCandidateName(value) {
  return cleanCandidateText(value).split(" ").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") || "Possible bill";
}

function getEventMatchText(event) {
  return cleanBillName(event?.name || event?.title || "")
    .toLowerCase()
    .replace(/\bbill around\b/g, " ")
    .replace(/\baround\b/g, " ")
    .replace(/£?\d+(\.\d{1,2})?/g, " ")
    .replace(/\bbill\b/g, " ")
    .replace(/\bsubscription\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeEvents(events = []) {
  return (events || []).reduce((list, event) => {
    const providerKey = getProviderKey(getBillBaseName(event.title) || event.title);
    const amount = Math.abs(Number(event.amount || 0));
    const day = Number(event.day || 0);
    const matchIndex = list.findIndex((existing) => {
      const existingProviderKey = getProviderKey(getBillBaseName(existing.title) || existing.title);
      const existingAmount = Math.abs(Number(existing.amount || 0));
      const existingDay = Number(existing.day || 0);
      return providerKey && existingProviderKey && providerKey === existingProviderKey && amountsClose(amount, existingAmount, 0.08, 3) && Math.abs(day - existingDay) <= 4;
    });
    if (matchIndex < 0) return [...list, event];
    const current = list[matchIndex];
    const better = scoreCalendarEvent(event) > scoreCalendarEvent(current) ? event : current;
    return list.map((item, index) => (index === matchIndex ? better : item));
  }, []);
}

function candidateMatchesExistingBill(candidate, events = []) {
  return (events || []).some((event) => {
    const eventProviderKey = getProviderKey(getBillBaseName(event.title) || event.title);
    const eventAmount = Math.abs(Number(event.amount || 0));
    return candidate.providerKey && eventProviderKey && candidate.providerKey === eventProviderKey && !isSeparateAmountBand(candidate.amount, eventAmount);
  });
}

function isSuppressedByCalendarRules(candidate, transactionRules = []) {
  const matchingSuppressions = (transactionRules || []).filter((rule) => {
    const category = normalizeText(rule?.category || "");
    const saysNotBill = rule?.rule_type === "calendar_suppression" || (!rule?.is_bill && !rule?.is_subscription && ["ignore for calendar", "not a bill", "spending", "personal payment"].includes(category));
    if (!saysNotBill) return false;
    const ruleProviderKey = getProviderKey(rule?.match_text || "");
    if (!ruleProviderKey) return false;
    const textMatches = candidate.providerKey === ruleProviderKey || candidate.providerKey.includes(ruleProviderKey) || ruleProviderKey.includes(candidate.providerKey);
    if (!textMatches) return false;
    const ruleAmount = Math.abs(Number(rule?.match_amount || 0));
    return !ruleAmount || amountsClose(candidate.amount, ruleAmount, 0.12, 3);
  });

  if (!matchingSuppressions.length) return false;

  const latestSuppressionTime = Math.max(...matchingSuppressions.map(ruleTime));
  const latestConfirmedTime = Math.max(0, ...(transactionRules || []).filter((rule) => {
    const type = normalizeText(rule?.rule_type || "");
    if (type !== "calendar_confirmed_bill" && !rule?.is_bill && !rule?.is_subscription) return false;
    const ruleProviderKey = getProviderKey(rule?.match_text || "");
    if (!ruleProviderKey) return false;
    const textMatches = candidate.providerKey === ruleProviderKey || candidate.providerKey.includes(ruleProviderKey) || ruleProviderKey.includes(candidate.providerKey);
    if (!textMatches) return false;
    const ruleAmount = Math.abs(Number(rule?.match_amount || 0));
    return !ruleAmount || amountsClose(candidate.amount, ruleAmount, 0.18, 3);
  }).map(ruleTime));

  return latestSuppressionTime >= latestConfirmedTime;
}

function dedupeHiddenSuggestionRules(rules = []) {
  const suppressions = (rules || []).filter((rule) => {
    const ruleType = normalizeText(rule.rule_type || "");
    const category = normalizeText(rule.category || "");
    return Boolean(rule.match_text) && (ruleType === "calendar_suppression" || category === "ignore for calendar");
  });

  return suppressions.filter((rule) => latestSuppressionWins(rule, rules)).reduce((list, rule) => {
    const providerKey = getProviderKey(rule.match_text || "");
    const amount = Math.abs(Number(rule.match_amount || 0));
    const matchIndex = list.findIndex((existing) => {
      const existingProviderKey = getProviderKey(existing.match_text || "");
      const existingAmount = Math.abs(Number(existing.match_amount || 0));
      return providerKey && existingProviderKey && providerKey === existingProviderKey && amountsClose(amount, existingAmount, 0.12, 3);
    });

    if (matchIndex < 0) return [...list, rule];

    const current = list[matchIndex];
    const better = new Date(rule.updated_at || rule.created_at || 0) > new Date(current.updated_at || current.created_at || 0)
      ? rule
      : current;

    return list.map((item, index) => (index === matchIndex ? better : item));
  }, []);
}

function latestSuppressionWins(suppressionRule, rules = []) {
  const providerKey = getProviderKey(suppressionRule.match_text || "");
  const amount = Math.abs(Number(suppressionRule.match_amount || 0));
  const suppressionTime = ruleTime(suppressionRule);
  const latestConfirmedTime = Math.max(0, ...(rules || []).filter((rule) => {
    const type = normalizeText(rule?.rule_type || "");
    if (type !== "calendar_confirmed_bill" && !rule?.is_bill && !rule?.is_subscription) return false;
    const ruleProviderKey = getProviderKey(rule.match_text || "");
    if (!providerKey || !ruleProviderKey) return false;
    const sameProvider = providerKey === ruleProviderKey || providerKey.includes(ruleProviderKey) || ruleProviderKey.includes(providerKey);
    const ruleAmount = Math.abs(Number(rule.match_amount || 0));
    const sameAmount = !amount || !ruleAmount || amountsClose(amount, ruleAmount, 0.18, 3);
    return sameProvider && sameAmount;
  }).map(ruleTime));
  return suppressionTime >= latestConfirmedTime;
}

function shortenHiddenNote(value) {
  return String(value || "")
    .replace(/^User marked\s+/i, "")
    .replace(/\s+from Calendar suggestions\./i, ".")
    .replace(/\s+from Calendar\./i, ".")
    .slice(0, 120);
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

function ruleTime(rule) {
  const value = new Date(rule?.updated_at || rule?.created_at || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function isSeparateAmountBand(a, b) {
  const first = Math.abs(Number(a || 0));
  const second = Math.abs(Number(b || 0));
  if (!first || !second) return false;
  return Math.abs(first - second) > Math.max(5, Math.max(first, second) * 0.25);
}

function amountsClose(a, b, percent, floor) {
  const first = Math.abs(Number(a || 0));
  const second = Math.abs(Number(b || 0));
  if (!first || !second) return false;
  return Math.abs(first - second) <= Math.max(floor, Math.max(first, second) * percent);
}

function scoreCalendarEvent(event) {
  const confidence = normalizeText(event?.confidenceLabel || event?.confidence || "");
  const confidenceScore = confidence === "high" ? 40 : confidence === "medium" ? 25 : confidence === "estimated" ? 12 : 0;
  return confidenceScore + Number(event?.sourceMonths || 0) * 6 + Number(event?.sourceCount || 0);
}

function getCalendarHeaderStyle(screenWidth) {
  return {
    marginBottom: 12,
    display: "grid",
    gap: 4,
    padding: screenWidth <= 520 ? "0 2px" : "0 4px",
  };
}

function getCalendarHeaderTitleStyle(screenWidth) {
  return {
    margin: 0,
    color: "#0f172a",
    fontSize: screenWidth <= 520 ? 28 : 34,
    lineHeight: 1.05,
    letterSpacing: 0,
  };
}

function getCalendarHeaderSubtitleStyle() {
  return {
    margin: 0,
    color: "#64748b",
    fontSize: 14,
    lineHeight: 1.45,
  };
}

function getCalendarHeroStyle(screenWidth, tone) {
  const accent = tone === "warn" ? "#f59e0b" : tone === "empty" ? "#64748b" : "#2563eb";
  return {
    marginBottom: 14,
    padding: screenWidth <= 520 ? 16 : 18,
    borderRadius: 18,
    border: "1px solid rgba(203, 213, 225, 0.84)",
    background: `linear-gradient(135deg, #ffffff 0%, #f8fbff 62%, ${hexToRgba(accent, 0.11)} 100%)`,
    boxShadow: "0 18px 44px rgba(15, 23, 42, 0.08)",
    overflow: "hidden",
  };
}

function getCalendarHeroTopStyle(screenWidth) {
  return {
    display: "grid",
    gridTemplateColumns: screenWidth <= 620 ? "1fr" : "minmax(0, 1.25fr) minmax(180px, 0.75fr)",
    gap: 14,
    alignItems: "stretch",
  };
}

function getCalendarHeroEyebrowStyle() {
  return {
    margin: "0 0 6px",
    color: "#2563eb",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
}

function getCalendarHeroTitleStyle(screenWidth) {
  return {
    margin: 0,
    color: "#0f172a",
    fontSize: screenWidth <= 520 ? 24 : 30,
    lineHeight: 1.04,
    letterSpacing: 0,
  };
}

function getCalendarHeroBodyStyle() {
  return {
    margin: "9px 0 0",
    color: "#526174",
    fontSize: 14,
    lineHeight: 1.48,
  };
}

function getCalendarHeroStatusStyle(tone) {
  const background = tone === "warn" ? "#fff7ed" : "#eff6ff";
  const border = tone === "warn" ? "#fed7aa" : "#bfdbfe";
  return {
    display: "grid",
    gap: 5,
    alignContent: "center",
    padding: 14,
    borderRadius: 14,
    background,
    border: `1px solid ${border}`,
  };
}

function getCalendarHeroMetricGridStyle(screenWidth) {
  return {
    display: "grid",
    gridTemplateColumns: screenWidth <= 620 ? "1fr" : "repeat(3, minmax(0, 1fr))",
    gap: 9,
    marginTop: 14,
  };
}

function getCalendarHeroMetricStyle(tone) {
  const colors = {
    bad: ["#fff1f2", "#fecdd3", "#991b1b"],
    good: ["#ecfdf5", "#bbf7d0", "#047857"],
    warn: ["#fff7ed", "#fed7aa", "#b45309"],
    focus: ["#eff6ff", "#bfdbfe", "#1d4ed8"],
    neutral: ["#f8fafc", "#e2e8f0", "#334155"],
  }[tone] || ["#f8fafc", "#e2e8f0", "#334155"];

  return {
    minWidth: 0,
    display: "grid",
    gap: 5,
    padding: 12,
    borderRadius: 12,
    background: colors[0],
    border: `1px solid ${colors[1]}`,
    color: colors[2],
  };
}

function getCalendarHeroActionRowStyle() {
  return {
    display: "flex",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 14,
  };
}

function getCalendarHeroPrimaryButtonStyle(tone) {
  return {
    border: 0,
    borderRadius: 12,
    padding: "11px 14px",
    background: tone === "warn" ? "#b45309" : "#0f172a",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  };
}

function getSimpleListStyle() {
  return {
    display: "grid",
    gap: 0,
  };
}

function getSmallActionRowStyle() {
  return {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
  };
}

function getBillRowStyle(needsChecking) {
  return {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 14,
    alignItems: "flex-start",
    padding: "13px 0",
    borderBottom: "1px solid #e8eef7",
    borderLeft: needsChecking ? "3px solid #f59e0b" : "3px solid transparent",
    paddingLeft: needsChecking ? 10 : 0,
  };
}

function getBillRowRightStyle() {
  return {
    display: "grid",
    justifyItems: "end",
    gap: 3,
    textAlign: "right",
    minWidth: 132,
  };
}

function getRowActionStyle() {
  return {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 6,
    marginTop: 5,
  };
}

function getAmountLabelStyle() {
  return {
    color: "#64748b",
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };
}

function getBillAmountStyle(needsChecking) {
  return {
    color: needsChecking ? "#b45309" : "#0f172a",
    fontSize: 17,
  };
}

function getMonthRowStyle(needsChecking) {
  return {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    padding: "13px 0",
    borderBottom: "1px solid #e8eef7",
    borderLeft: needsChecking ? "3px solid #f59e0b" : "3px solid transparent",
    paddingLeft: needsChecking ? 10 : 0,
  };
}

function getMonthAmountWrapStyle() {
  return {
    display: "grid",
    justifyItems: "end",
    gap: 4,
    textAlign: "right",
    minWidth: 132,
  };
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
