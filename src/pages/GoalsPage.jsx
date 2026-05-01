import { useState } from "react";
import { supabase } from "../supabase";
import {
  ActionCard as BaseActionCard,
  InsightCard as BaseInsightCard,
  Row as BaseRow,
  Section as BaseSection,
} from "../components/ui";
import { buildGoalSuggestions } from "../lib/goalInsights";
import { getMeaningfulCategory } from "../lib/finance";
import { buildRecurringMajorPaymentCandidates } from "../lib/transactionCategorisation";

export default function GoalsPage({
  goals,
  accounts = [],
  transactions,
  transactionRules = [],
  onGoToCoach,
  onNavigate,
  onChange,
  onAccountsChange,
  onTransactionRulesChange,
  styles,
  helpers,
}) {
  const {
    getDataFreshness,
    getDisplayedMonthSnapshot,
    getSubscriptionSummary,
    isInternalTransferLike,
    isTransactionInMonth,
    formatCurrency,
    numberOrNull,
  } = helpers;
  const freshness = getDataFreshness(transactions);
  const latestMonth = getDisplayedMonthSnapshot(transactions);
  const subscriptionSummary = getSubscriptionSummary(transactions);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    target_amount: "",
    current_amount: "",
    timeframe: "fast",
  });
  const [savingAccountRole, setSavingAccountRole] = useState("");
  const [savingRuleKey, setSavingRuleKey] = useState("");

  const latestDate = transactions.map((t) => new Date(t.transaction_date)).filter((date) => !Number.isNaN(date.getTime())).sort((a, b) => b - a)[0] || new Date();
  const timeframeStart = new Date(latestDate.getFullYear(), latestDate.getMonth() - 2, 1);
  const timeframeLabel = `${timeframeStart.toLocaleDateString("en-GB", { month: "short" })} to ${latestDate.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`;
  const timeframeTransactions = transactions.filter((transaction) => {
    const date = new Date(transaction.transaction_date);
    return !Number.isNaN(date.getTime()) && date >= timeframeStart && date <= latestDate && !isInternalTransferLike(transaction);
  });
  const categoryTotals = timeframeTransactions
    .filter((transaction) => Number(transaction.amount) < 0 && !isBillLike(transaction))
    .reduce((groups, transaction) => {
      const category = getMeaningfulCategory(transaction) || "Spending";
      groups[category] = (groups[category] || 0) + Math.abs(Number(transaction.amount || 0));
      return groups;
    }, {});
  const behaviourInsights = Object.entries(categoryTotals)
    .map(([category, total]) => ({
      category,
      threeMonthTotal: total,
      amountLabel: formatCurrency(total),
      monthlyAverage: total / 3,
    }))
    .filter((item) => !["Income", "Internal Transfer", "Uncategorised", "Spending", "Bill"].includes(item.category))
    .sort((a, b) => b.threeMonthTotal - a.threeMonthTotal)
    .slice(0, 4);
  const reviewTransactions = timeframeTransactions
    .filter((transaction) => Number(transaction.amount) < 0 && !isBillLike(transaction))
    .slice(0, 6);
  const accountStats = accounts.map((account) => {
    const tx = transactions.filter((transaction) => transaction.account_id === account.id);
    const incomingTransfers = tx.filter((transaction) => Number(transaction.amount) > 0 && isInternalTransferLike(transaction));
    const outgoingTransfers = tx.filter((transaction) => Number(transaction.amount) < 0 && isInternalTransferLike(transaction));
    const externalOut = tx.filter((transaction) => Number(transaction.amount) < 0 && !isInternalTransferLike(transaction));
    const accountDecision = account.counts_as_savings;
    const nameLooksSavings = /save|saver|saving|isa|pot|vault|reserve|emergency/i.test(`${account.name || ""} ${account.nickname || ""}`);
    const inferredSavings = nameLooksSavings && incomingTransfers.length >= outgoingTransfers.length && externalOut.length <= 2;
    const likelySavings = accountDecision === true || (accountDecision == null && inferredSavings);
    const netTransferIn = incomingTransfers.reduce((sum, item) => sum + Number(item.amount || 0), 0) - outgoingTransfers.reduce((sum, item) => sum + Math.abs(Number(item.amount || 0)), 0);
    return { account, likelySavings, nameLooksSavings, netTransferIn: Math.max(netTransferIn, 0) };
  });
  const suggestedSavingsAccounts = accountStats.filter((item) => item.nameLooksSavings && item.account.counts_as_savings == null);
  const majorPaymentCandidates = buildRecurringMajorPaymentCandidates(transactions, transactionRules);
  const confirmedSavingsIn = accountStats
    .filter((item) => item.likelySavings)
    .reduce((sum, item) => sum + item.netTransferIn, 0);
  const latestMonthBills = transactions
    .filter(
      (transaction) =>
        isTransactionInMonth(transaction, latestMonth.monthDate || new Date()) &&
        isBillLike(transaction)
    )
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);

  const mainGoal =
    goals.find((goal) => String(goal.name || "").toLowerCase().includes("house")) ||
    goals[0] ||
    null;
  const hasSavedGoal = Boolean(mainGoal);
  const suggestions = buildGoalSuggestions({
    hasData: freshness.hasData,
    monthlyBills: latestMonthBills,
    behaviourInsights,
    timeframeLabel,
    latestMonthName: latestMonth.monthName,
    subscriptionCount: subscriptionSummary.count,
  });
  const primarySuggestion = suggestions[0];

  const target = Number(mainGoal?.target_amount || 0);
  const current = Number(mainGoal?.current_amount || 0);
  const percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const gap = Math.max(target - current, 0);
  const nextMilestone = gap > 0
    ? Math.min(target, current + Math.max(250, Math.ceil(gap / 4 / 50) * 50))
    : target;

  function fillGoalForm(suggestion) {
    setForm({
      name: suggestion.name,
      target_amount: String(suggestion.target),
      current_amount: suggestion.current ? String(suggestion.current.toFixed(2)) : "",
      timeframe: "fast",
    });
  }
  async function confirmSavingsAccount(accountId, value) {
    setSavingAccountRole(accountId);
    try {
      const { error } = await supabase
        .from("accounts")
        .update({
          counts_as_savings: value,
          account_role: value ? "savings" : "not_savings",
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountId);

      if (error) throw error;
      await onAccountsChange?.();
    } catch {
      alert("Could not save that account choice yet.");
    } finally {
      setSavingAccountRole("");
    }
  }

  async function confirmMajorPayment(candidate, category) {
    setSavingRuleKey(candidate.key);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const isBill = category !== "Personal payment";
      const { error } = await supabase.from("transaction_rules").upsert(
        {
          user_id: user.id,
          rule_type: "recurring_major_payment",
          match_text: candidate.matchText,
          match_amount: candidate.amount,
          category,
          is_bill: isBill,
          is_subscription: false,
          is_internal_transfer: false,
          notes: `${candidate.count} payments across ${candidate.monthCount} months. Example: ${candidate.sampleDescription}`,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,rule_type,match_text,match_amount" }
      );

      if (error) throw error;
      await onTransactionRulesChange?.();
    } catch {
      alert("Could not save that transaction rule yet. You may need to run the latest Supabase migration first.");
    } finally {
      setSavingRuleKey("");
    }
  }

  async function saveGoal(extra = {}) {
    const name = String(extra.name ?? form.name).trim();
    const targetAmount = numberOrNull(extra.target ?? form.target_amount);
    const currentAmount = numberOrNull(extra.current ?? form.current_amount) || 0;

    if (!name || !targetAmount) {
      alert("Add a goal name and target first.");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("money_goals").insert({
        user_id: user.id,
        name,
        target_amount: targetAmount,
        current_amount: currentAmount,
        priority: goals.length + 1,
      });

      if (error) throw error;

      setForm({ name: "", target_amount: "", current_amount: "", timeframe: "fast" });
      await onChange();
      alert("Goal saved.");
    } catch (error) {
      alert(error.message || "Could not save goal.");
    } finally {
      setSaving(false);
    }
  }

  const goalRead = hasSavedGoal
    ? {
        headline: gap > 0 ? `${formatCurrency(gap)} still to go` : "Target reached",
        body: gap > 0
          ? `Next sensible marker is ${formatCurrency(nextMilestone)}. This is based only on your saved goal values, not invented progress.`
          : "This saved goal is already at or above target, so the next move is setting a fresh target.",
      }
    : {
        headline: "No saved goal yet",
        body: freshness.hasData
          ? "The figures below are suggestions from your statement patterns, not goals you created."
          : "Upload a statement first and Money Hub can suggest goals from real spending instead of generic targets.",
      };
  const settledIncome = timeframeTransactions
    .filter((transaction) => Number(transaction.amount) > 0)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const settledSpend = timeframeTransactions
    .filter((transaction) => Number(transaction.amount) < 0)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const monthlyIncome = settledIncome / 3;
  const monthlySpend = settledSpend / 3;
  const monthlyRoom = Math.max(monthlyIncome - monthlySpend, 0);
  const topBehaviourSave = behaviourInsights[0] ? behaviourInsights[0].monthlyAverage * 0.25 : 0;
  const likelyMonthlySaving = Math.max(confirmedSavingsIn / 3, monthlyRoom * 0.5, topBehaviourSave);
  const planningGap = hasSavedGoal ? gap : Math.max(Number(form.target_amount || 0) - Number(form.current_amount || 0), 0);
  const fastestMonths = planningGap > 0 && likelyMonthlySaving > 0 ? Math.ceil(planningGap / likelyMonthlySaving) : null;
  const goalPaths = [
    {
      label: "Fastest safe route",
      headline: likelyMonthlySaving > 0 ? `${formatCurrency(likelyMonthlySaving)} possible monthly push` : "Need cleaner data first",
      body: "Uses income, spending, confirmed savings transfers, bills, and realistic behaviour swaps. Best when you want the target as soon as possible without pretending bills do not exist.",
      prompt: "Build my fastest safe route to my goal. Use bills, debts, spending, income, and realistic cuts. Do not count internal transfers unless they go into confirmed savings accounts.",
    },
    {
      label: "Behaviour route",
      headline: behaviourInsights[0] ? `Start with ${behaviourInsights[0].category}` : "Find one flexible category",
      body: behaviourInsights[0]
        ? `${behaviourInsights[0].category} is the clearest flexible lever in ${timeframeLabel}. This is more useful than a vague budget cut.`
        : "Once categories are cleaner, this will find one flexible habit to change first.",
      prompt: "Turn my biggest flexible spending category into a goal plan with small weekly behaviour changes.",
    },
    {
      label: "Stability route",
      headline: "Protect bills before chasing targets",
      body: "Good goals should leave rent, bills, debts, and essential spending protected first. This route builds a goal from what is safely left.",
      prompt: "Check what I can safely save after rent, bills, debts, subscriptions, and essentials. Then give me a goal plan.",
    },
  ];

  return (
    <>
      {hasSavedGoal ? (
        <BaseSection styles={styles} title={mainGoal.name || "Saved Goal"}>
          <p style={styles.goalStat}>{formatCurrency(current)} / {formatCurrency(target)}</p>
          <div style={styles.progressOuter}>
            <div style={{ ...styles.progressInner, width: `${percent}%` }} />
          </div>
          <div style={styles.inlineInfoBlock}>
            <BaseRow styles={styles} name="Progress" value={`${percent.toFixed(0)}%`} />
            <BaseRow styles={styles} name="Left to go" value={formatCurrency(gap)} />
            <BaseRow styles={styles} name="Next milestone" value={formatCurrency(nextMilestone)} />
          </div>
        </BaseSection>
      ) : (
        <BaseSection styles={styles}
          title="No Saved Goal Yet"
          right={
            <button style={styles.ghostBtn} type="button" onClick={() => onNavigate("upload")}>
              Upload data
            </button>
          }
        >
          <p style={styles.emptyText}>
            No saved goal is on your account yet. The ideas below are estimates from visible money patterns,
            kept separate from goals you choose to save.
          </p>
          {primarySuggestion ? (
            <div style={styles.inlineInfoBlock}>
              <BaseRow styles={styles} name="Smart suggestion" value={primarySuggestion.name} />
              <BaseRow styles={styles} name="Suggested target" value={formatCurrency(primarySuggestion.target)} />
              <BaseRow
                styles={styles}
                name="Progress today"
                value={primarySuggestion.current > 0 ? formatCurrency(primarySuggestion.current) : "Not set yet"}
              />
            </div>
          ) : null}
          <p style={styles.transactionMeta}>
            Suggestions are planning prompts only. Money Hub will not treat an estimated amount as a saved goal until you choose to save it.
          </p>
        </BaseSection>
      )}

      <BaseSection styles={styles} title={hasSavedGoal ? "Goal Read" : "Smart Goal Ideas"}>
        <p style={styles.sectionIntro}>
          Goal insights use {timeframeLabel}. Transfers are ignored unless they land in a confirmed savings-style account, and behaviour wins exclude bills and subscriptions.
        </p>
        <div style={styles.aiInsightGrid}>
          <BaseInsightCard styles={styles}
            label={hasSavedGoal ? "Saved goal" : "Suggestion"}
            headline={goalRead.headline}
            body={goalRead.body}
            ctaLabel={freshness.needsUpload ? "Upload statement" : "Ask AI for plan"}
            onClick={() =>
              freshness.needsUpload
                ? onNavigate("upload")
                : onGoToCoach(
                    hasSavedGoal
                      ? `Give me a sharp plan for my saved goal: ${mainGoal.name}, target ${formatCurrency(target)}, current ${formatCurrency(current)}.`
                      : "Look at my money data and recommend the best first goal. Be clear about which figures are estimates.",
                    { autoSend: true }
                  )
            }
          />
          {!hasSavedGoal && suggestions.slice(0, 2).map((suggestion) => (
            <BaseActionCard styles={styles}
              key={suggestion.key}
              label={suggestion.label}
              headline={suggestion.headline}
              body={suggestion.body}
              actionLabel="Use this"
              onClick={() => fillGoalForm(suggestion)}
            />
          ))}
        </div>
      </BaseSection>

      <BaseSection styles={styles} title="Fastest Route">
        <p style={styles.sectionIntro}>
          This uses {timeframeLabel}, ignores account-to-account transfers unless they land in a confirmed savings-style account, and keeps bills/spending in the picture.
        </p>
        <BaseRow styles={styles} name="Average income" value={formatCurrency(monthlyIncome)} />
        <BaseRow styles={styles} name="Average spending" value={formatCurrency(monthlySpend)} />
        <BaseRow styles={styles} name="Likely monthly saving room" value={likelyMonthlySaving > 0 ? formatCurrency(likelyMonthlySaving) : "Not enough room visible"} />
        <BaseRow styles={styles} name="Fastest estimate" value={fastestMonths ? `${fastestMonths} month${fastestMonths === 1 ? "" : "s"}` : "Add a target first"} />
        <button
          style={styles.primaryBtn}
          type="button"
          onClick={() =>
            onGoToCoach(
              `I want to reach ${hasSavedGoal ? mainGoal.name : form.name || "my goal"} as fast as realistically possible. Target ${formatCurrency(hasSavedGoal ? target : Number(form.target_amount || 0))}, current ${formatCurrency(hasSavedGoal ? current : Number(form.current_amount || 0))}. Use income ${formatCurrency(monthlyIncome)}, spending ${formatCurrency(monthlySpend)}, bills ${formatCurrency(latestMonthBills)}, debts if visible, and behaviour changes from ${timeframeLabel}.`,
              { autoSend: true }
            )
          }
          disabled={!hasSavedGoal && !Number(form.target_amount || 0)}
        >
          Ask AI for fastest realistic plan
        </button>
      </BaseSection>

      {suggestedSavingsAccounts.length > 0 ? (
        <BaseSection styles={styles} title="Savings Account Check">
          <p style={styles.sectionIntro}>
            I found an account that looks savings-like. Confirm once and I will count money that lands there and stays there as savings progress.
          </p>
          {suggestedSavingsAccounts.map(({ account }) => (
            <div key={account.id} style={styles.signalCard}>
              <strong>{account.name}</strong>
              <p style={styles.transactionMeta}>Should transfers into this account count as savings?</p>
              <div style={styles.inlineBtnRow}>
                <button style={styles.secondaryInlineBtn} type="button" onClick={() => confirmSavingsAccount(account.id, true)} disabled={savingAccountRole === account.id}>Yes</button>
                <button style={styles.secondaryInlineBtn} type="button" onClick={() => confirmSavingsAccount(account.id, false)} disabled={savingAccountRole === account.id}>No</button>
              </div>
            </div>
          ))}
        </BaseSection>
      ) : null}

      {majorPaymentCandidates.length > 0 ? (
        <BaseSection styles={styles} title="Major Payment Check">
          <p style={styles.sectionIntro}>
            These payments repeat like rent, mortgage, or a major bill. Confirm once and Money Hub will use the answer across goals, calendar, spending reads, and AI context.
          </p>
          {majorPaymentCandidates.map((candidate) => (
            <div key={candidate.key} style={styles.signalCard}>
              <div style={styles.signalHeader}>
                <div>
                  <strong>{candidate.label}</strong>
                  <p style={styles.transactionMeta}>
                    About {formatCurrency(candidate.amount)} repeated {candidate.count} times across {candidate.monthCount} months.
                  </p>
                </div>
              </div>
              <p style={styles.signalBody}>Should this be protected as a bill instead of treated as flexible spending?</p>
              <div style={styles.inlineBtnRow}>
                <button style={styles.secondaryInlineBtn} type="button" onClick={() => confirmMajorPayment(candidate, "Rent")} disabled={savingRuleKey === candidate.key}>Rent</button>
                <button style={styles.secondaryInlineBtn} type="button" onClick={() => confirmMajorPayment(candidate, "Mortgage")} disabled={savingRuleKey === candidate.key}>Mortgage</button>
                <button style={styles.secondaryInlineBtn} type="button" onClick={() => confirmMajorPayment(candidate, "Major bill")} disabled={savingRuleKey === candidate.key}>Major bill</button>
                <button style={styles.secondaryInlineBtn} type="button" onClick={() => confirmMajorPayment(candidate, "Personal payment")} disabled={savingRuleKey === candidate.key}>Not a bill</button>
              </div>
            </div>
          ))}
        </BaseSection>
      ) : null}

      <BaseSection styles={styles} title={hasSavedGoal ? "Next Moves" : "Save A Goal"}>
        {!hasSavedGoal ? (
          <>
            <input
              style={styles.input}
              placeholder="Goal name, e.g. Emergency buffer"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <input
              style={styles.input}
              placeholder="Target amount"
              inputMode="decimal"
              value={form.target_amount}
              onChange={(e) => setForm((prev) => ({ ...prev, target_amount: e.target.value }))}
            />
            <input
              style={styles.input}
              placeholder="Current amount, optional"
              inputMode="decimal"
              value={form.current_amount}
              onChange={(e) => setForm((prev) => ({ ...prev, current_amount: e.target.value }))}
            />
            <select
              style={styles.input}
              value={form.timeframe}
              onChange={(e) => setForm((prev) => ({ ...prev, timeframe: e.target.value }))}
            >
              <option value="fast">As fast as realistically possible</option>
              <option value="6m">Within 6 months</option>
              <option value="12m">Within 12 months</option>
              <option value="24m">Within 24 months</option>
            </select>
            <button style={styles.primaryBtn} type="button" onClick={() => saveGoal()} disabled={saving}>
              {saving ? "Saving..." : "Save Goal"}
            </button>
          </>
        ) : (
          <div style={styles.aiInsightGrid}>
            <BaseActionCard styles={styles}
              label="AI plan"
              headline={`${mainGoal.name || "This goal"} needs a practical route`}
              body="Ask the coach to turn the target into monthly actions using the data already visible in the app."
              actionLabel="Ask AI"
              onClick={() =>
                onGoToCoach(
                  `Build me a practical plan for my goal: ${mainGoal.name}, target ${formatCurrency(target)}, current ${formatCurrency(current)}.`,
                  { autoSend: true }
                )
              }
            />
            <BaseActionCard styles={styles}
              label="Safety check"
              headline={latestMonthBills > 0 ? `${formatCurrency(latestMonthBills)} in visible bills` : "Bills need cleaner history"}
              body="Before chasing a target, check whether the monthly bills and recurring payments leave enough room."
              actionLabel={freshness.needsUpload ? "Upload latest" : "Ask AI"}
              onClick={() =>
                freshness.needsUpload
                  ? onNavigate("upload")
                  : onGoToCoach("Check whether my saved goal is realistic against my bills, subscriptions, debts, and spending patterns.", { autoSend: true })
              }
            />
          </div>
        )}
      </BaseSection>

      {behaviourInsights.length > 0 ? (
        <BaseSection styles={styles} title="Behaviour Wins">
          <p style={styles.sectionIntro}>
            Small swaps work better than guilt. These are the biggest visible spending areas in {timeframeLabel}.
          </p>
          {behaviourInsights.slice(0, 3).map((item) => (
            <BaseInsightCard
              key={item.category}
              styles={styles}
              label="Did you know?"
              headline={`${item.category} cost ${item.amountLabel}`}
              body={`If you redirected just 25% of that, your goal would gain ${formatCurrency(item.threeMonthTotal * 0.25)} without needing a total lifestyle reset.`}
              ctaLabel="Build habit plan"
              onClick={() => onGoToCoach(`Create a practical goal habit from my ${item.category} spending. Over ${timeframeLabel}, it was ${item.amountLabel}. Give me small weekly actions.`, { autoSend: true })}
            />
          ))}
        </BaseSection>
      ) : (
        <BaseSection styles={styles} title="Behaviour Wins">
          <p style={styles.sectionIntro}>
            I cannot see a clean flexible spending category yet. A lot of the visible spend is either bills, subscriptions, transfers, or still too broadly labelled as Spending.
          </p>
          <BaseActionCard
            styles={styles}
            label="Data quality"
            headline="Goals need cleaner categories"
            body="Upload more statements or review transactions so Money Hub can separate takeaways, shopping, transport, bills, and transfers properly."
            actionLabel="Review transactions"
            onClick={() => onNavigate("accounts")}
          />
        </BaseSection>
      )}

      <BaseSection styles={styles} title="Transaction Review">
        <p style={styles.sectionIntro}>
          There is not a full tagging screen yet, so this shows the flexible transactions currently feeding goal suggestions. Bills, subscriptions, rent, and transfers are left out.
        </p>
        {reviewTransactions.length === 0 ? (
          <p style={styles.emptyText}>No reviewable spending found in {timeframeLabel}.</p>
        ) : (
          reviewTransactions.map((transaction) => (
            <BaseRow
              key={transaction.id || `${transaction.transaction_date}-${transaction.description}-${transaction.amount}`}
              styles={styles}
              name={`${transaction.description || "Transaction"} (${getMeaningfulCategory(transaction) || "Uncategorised"})`}
              value={`${transaction.transaction_date || ""} - ${formatCurrency(Math.abs(Number(transaction.amount || 0)))}`}
            />
          ))
        )}
      </BaseSection>

      <BaseSection styles={styles} title="Goal Routes">
        <p style={styles.sectionIntro}>
          Pick the style of plan you want. These are routes, not random extra goals.
        </p>
          {goalPaths.map((route) => (
            <div key={route.label} style={styles.signalCard}>
              <div style={styles.signalHeader}>
                <div>
                  <strong>{route.label}</strong>
                  <p style={styles.transactionMeta}>{route.headline}</p>
                </div>
              </div>
              <p style={styles.signalBody}>{route.body}</p>
              <div style={styles.inlineBtnRow}>
                <button
                  style={styles.secondaryInlineBtn}
                  type="button"
                  onClick={() => onGoToCoach(route.prompt, { autoSend: true })}
                >
                  Ask AI
                </button>
              </div>
            </div>
          ))}
      </BaseSection>

      {goals.length > 1 ? (
        <BaseSection styles={styles} title="Saved Goals">
          {goals.map((goal) => {
            const savedTarget = Number(goal.target_amount || 0);
            const savedCurrent = Number(goal.current_amount || 0);
            const savedPercent = savedTarget > 0 ? Math.min((savedCurrent / savedTarget) * 100, 100) : 0;
            return (
              <BaseRow styles={styles}
                key={goal.id || goal.name}
                name={goal.name || "Goal"}
                value={`${savedPercent.toFixed(0)}% of ${formatCurrency(savedTarget)}`}
              />
            );
          })}
        </BaseSection>
      ) : null}

      <BaseSection styles={styles} title="What This Uses">
        <BaseRow styles={styles} name="Latest visible month" value={latestMonth.monthName} />
        <BaseRow styles={styles} name="Visible monthly bills" value={latestMonthBills > 0 ? formatCurrency(latestMonthBills) : "Not enough yet"} />
        <BaseRow styles={styles} name="Insight timeframe" value={timeframeLabel} />
        <BaseRow styles={styles} name="Transfers ignored" value="Yes" />
        <BaseRow styles={styles} name="Confirmed savings transfer in" value={formatCurrency(confirmedSavingsIn)} />
        <BaseRow styles={styles} name="Saved goals" value={`${goals.length}`} />
      </BaseSection>
    </>
  );
}

function isBillLike(transaction) {
  return Boolean(transaction._smart_is_bill || transaction.is_bill || transaction._smart_is_subscription || transaction.is_subscription);
}
