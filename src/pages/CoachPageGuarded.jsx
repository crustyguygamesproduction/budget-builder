import { useEffect, useRef } from "react";
import { supabase } from "../supabase";
import CoachPage from "./CoachPage";

const COACH_SNAPSHOT_RETRY_COUNT = 5;
const COACH_SNAPSHOT_RETRY_DELAY_MS = 650;

export default function CoachPageGuarded(props) {
  const expectedSnapshotRef = useRef(getExpectedCoachSnapshot(props.transactions));

  expectedSnapshotRef.current = getExpectedCoachSnapshot(props.transactions);

  useEffect(() => {
    const originalInvoke = supabase.functions.invoke.bind(supabase.functions);

    supabase.functions.invoke = async (functionName, options = {}) => {
      if (functionName === "ai-coach") {
        await assertSavedCoachSnapshotIsFresh(expectedSnapshotRef.current);
      }

      return originalInvoke(functionName, options);
    };

    return () => {
      supabase.functions.invoke = originalInvoke;
    };
  }, []);

  return <CoachPage {...props} />;
}

function getExpectedCoachSnapshot(transactions = []) {
  const dates = (transactions || [])
    .map((transaction) => transaction?.transaction_date)
    .filter(Boolean)
    .sort();

  return {
    transactionCount: transactions.length,
    latestTransactionDate: dates.at(-1) || null,
  };
}

async function assertSavedCoachSnapshotIsFresh(expected) {
  if (!expected?.transactionCount) return;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    throw new Error("Please sign in again before using Coach.");
  }

  let lastSnapshot = null;
  let lastError = null;

  for (let attempt = 0; attempt < COACH_SNAPSHOT_RETRY_COUNT; attempt += 1) {
    const { data, error } = await supabase
      .from("coach_context_snapshots")
      .select("context, context_hash, transaction_count, latest_transaction_date, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      lastError = error;
    } else {
      lastSnapshot = data;
      if (isFreshCoachSnapshot(data, expected)) return;
    }

    await delay(COACH_SNAPSHOT_RETRY_DELAY_MS);
  }

  if (lastError) {
    throw new Error(lastError.message || "Coach brain could not be checked. Try again in a moment.");
  }

  const expectedText = `${expected.transactionCount} transaction${expected.transactionCount === 1 ? "" : "s"}${expected.latestTransactionDate ? ` up to ${expected.latestTransactionDate}` : ""}`;
  const savedCount = getSnapshotContextCount(lastSnapshot);
  const savedLatest = getSnapshotContextLatestDate(lastSnapshot);
  const savedText = lastSnapshot
    ? `${savedCount || 0} transaction${savedCount === 1 ? "" : "s"}${savedLatest ? ` up to ${savedLatest}` : ""}`
    : "no saved Coach brain yet";

  throw new Error(
    `Coach brain is still updating, so I stopped this from using stale money data. Expected ${expectedText}, but the saved brain has ${savedText}. Try again in a moment.`
  );
}

function isFreshCoachSnapshot(snapshot, expected) {
  if (!snapshot?.context) return false;

  const contextCount = getSnapshotContextCount(snapshot);
  const contextLatestDate = getSnapshotContextLatestDate(snapshot);

  if (contextCount !== expected.transactionCount) return false;
  if (expected.latestTransactionDate && contextLatestDate !== expected.latestTransactionDate) return false;

  return true;
}

function getSnapshotContextCount(snapshot) {
  const context = snapshot?.context || {};
  const contextCount = Number(context.transaction_count);

  if (Number.isFinite(contextCount) && contextCount > 0) return contextCount;

  const searchableCount = Number(context.searchable_transaction_count);
  if (Number.isFinite(searchableCount) && searchableCount > 0) return searchableCount;

  if (Array.isArray(context.searchable_transactions)) return context.searchable_transactions.length;
  if (Array.isArray(context.recent_transactions)) return context.recent_transactions.length;

  const rowCount = Number(snapshot?.transaction_count);
  return Number.isFinite(rowCount) ? rowCount : 0;
}

function getSnapshotContextLatestDate(snapshot) {
  const context = snapshot?.context || {};

  const candidates = [
    context.latest_transaction_date,
    context.data_freshness?.latest_transaction_date,
    context.data_freshness?.latestTransactionDate,
    context.statement_intelligence?.date_range?.end,
    context.statement_intelligence?.date_range?.latest,
    snapshot?.latest_transaction_date,
  ];

  const direct = candidates.find(Boolean);
  if (direct) return String(direct).slice(0, 10);

  const transactionDates = [
    ...(Array.isArray(context.searchable_transactions) ? context.searchable_transactions : []),
    ...(Array.isArray(context.recent_transactions) ? context.recent_transactions : []),
  ]
    .map((transaction) => transaction?.transaction_date || transaction?.date)
    .filter(Boolean)
    .map((date) => String(date).slice(0, 10))
    .sort();

  return transactionDates.at(-1) || null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
