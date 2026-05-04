import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "vite";

const server = await createServer({
  configLoader: "native",
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true },
});

const { buildMoneyUnderstanding } = await server.ssrLoadModule("/src/lib/moneyUnderstanding.js");
const { buildAppMoneyModel } = await server.ssrLoadModule("/src/lib/appMoneyModel.js");
const { getStatementIntelligenceContext } = await server.ssrLoadModule("/src/lib/statementIntelligence.js");
const { buildCoachContext } = await server.ssrLoadModule("/src/lib/coachContext.js");

let nextId = 1;

function tx(description, amount, date, extra = {}) {
  return {
    id: `tx-${nextId++}`,
    transaction_date: date,
    description,
    amount,
    category: extra.category || "Spending",
    is_bill: Boolean(extra.is_bill),
    is_subscription: Boolean(extra.is_subscription),
    is_internal_transfer: Boolean(extra.is_internal_transfer),
    account_id: extra.account_id || "main",
  };
}

function amounts(items) {
  return items.map((item) => Number(item.amount.toFixed(2))).sort((a, b) => a - b);
}

function buildModel(transactions, options = {}) {
  const understanding = buildMoneyUnderstanding({ transactions, transactionRules: options.transactionRules || [] });
  return {
    understanding,
    appModel: buildAppMoneyModel({
      moneyUnderstanding: understanding,
      goals: options.goals || [],
      debts: options.debts || [],
      investments: options.investments || [],
    }),
  };
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("EE Limited mobile", -16, "2026-02-05"),
      tx("EE Limited mobile", -16, "2026-03-05"),
      tx("EE Limited mobile", -16, "2026-04-05"),
      tx("EE Limited broadband", -31.99, "2026-02-20"),
      tx("EE Limited broadband", -31.99, "2026-03-20"),
      tx("EE Limited broadband", -31.99, "2026-04-20"),
    ],
  });

  assert.deepEqual(amounts(understanding.billStreams), [16, 31.99]);
  assert.equal(understanding.billStreams.filter((stream) => /EE/.test(stream.name)).length, 2);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("Tesco Stores", -42.1, "2026-02-08"),
      tx("Tesco Stores", -44.5, "2026-03-08"),
      tx("Tesco Stores", -39.2, "2026-04-08"),
    ],
  });

  assert.equal(understanding.billStreams.length, 0);
  assert.equal(understanding.checks.length, 0);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("Transfer to savings pot", -100, "2026-02-10", { is_internal_transfer: true }),
      tx("Transfer to savings pot", -100, "2026-03-10", { is_internal_transfer: true }),
      tx("Transfer to savings pot", -100, "2026-04-10", { is_internal_transfer: true }),
    ],
  });

  assert.equal(understanding.billStreams.length, 0);
  assert.equal(understanding.checks.length, 0);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("Proovia delivery job", -120, "2026-02-12"),
      tx("Proovia delivery job", -120, "2026-03-12"),
      tx("Mynextbike work pass", -30, "2026-02-15"),
      tx("Mynextbike work pass", -30, "2026-03-15"),
    ],
  });

  assert.equal(understanding.billStreams.length, 0);
  assert.equal(understanding.checks.length, 0);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("Netflix", -5.99, "2026-01-30"),
      tx("Netflix", -5.99, "2026-01-30"),
      tx("Netflix", -5.99, "2026-03-01"),
      tx("Netflix", -5.99, "2026-04-05"),
    ],
  });

  assert.equal(understanding.billStreams.length, 1);
  assert.equal(understanding.billStreams[0].sourceCount, 3);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("Virgin Media", -46, "2026-02-03"),
      tx("Virgin Media", -46, "2026-03-05"),
      tx("Virgin Media", -46, "2026-04-02"),
    ],
  });

  assert.equal(understanding.billStreams.length, 1);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("ACME payment", -420, "2026-02-14"),
      tx("ACME payment", -420, "2026-03-14"),
      tx("ACME payment", -420, "2026-04-14"),
    ],
  });

  assert.equal(understanding.billStreams.length, 0);
  assert.equal(understanding.checks.length, 1);
}

{
  const transactions = [
    tx("EE Limited mobile", -16, "2026-02-05"),
    tx("EE Limited mobile", -16, "2026-03-05"),
    tx("EE Limited mobile", -16, "2026-04-05"),
  ];
  const understanding = buildMoneyUnderstanding({
    transactions,
    transactionRules: [
      {
        rule_type: "calendar_confirmed_bill",
        match_text: "ee limited",
        match_amount: 16,
        category: "Phone",
        is_bill: true,
        updated_at: "2026-04-01T10:00:00.000Z",
      },
      {
        rule_type: "calendar_suppression",
        match_text: "ee limited",
        match_amount: 16,
        category: "Ignore for Calendar",
        is_bill: false,
        is_subscription: false,
        updated_at: "2026-04-02T10:00:00.000Z",
      },
    ],
  });
  const appModel = buildAppMoneyModel({ moneyUnderstanding: understanding });

  assert.equal(understanding.billStreams.length, 0);
  assert.equal(appModel.monthlyBillTotal, 0);
  assert.ok(appModel.flexibleSpending.transactions.some((transaction) => /EE Limited/.test(transaction.description)));
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("EE Limited mobile", -16, "2026-02-05"),
      tx("EE Limited mobile", -16, "2026-03-05"),
      tx("EE Limited mobile", -16, "2026-04-05"),
    ],
    transactionRules: [
      {
        rule_type: "calendar_suppression",
        match_text: "ee limited",
        match_amount: 16,
        category: "Ignore for Calendar",
        updated_at: "2026-04-01T10:00:00.000Z",
      },
      {
        rule_type: "calendar_confirmed_bill",
        match_text: "ee limited",
        match_amount: 16,
        category: "Phone",
        is_bill: true,
        updated_at: "2026-04-02T10:00:00.000Z",
      },
    ],
  });

  assert.equal(understanding.billStreams.length, 1);
  assert.equal(understanding.billStreams[0].amount, 16);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [],
    transactionRules: [
      {
        rule_type: "calendar_confirmed_bill",
        match_text: "google one",
        match_amount: 7.99,
        category: "Subscription",
        is_subscription: true,
        updated_at: "2026-04-02T10:00:00.000Z",
      },
    ],
    snapshot: {
      id: "snap-1",
      bill_streams: [
        { key: "snapshot:google", name: "Google spending around 7.99", amount: 7.99, day: 8, kind: "subscription", confidence: "medium" },
        { key: "snapshot:google-one", name: "Google One", amount: 7.99, day: 12, kind: "subscription", confidence: "medium" },
      ],
      checks: [],
      summary: {},
    },
  });

  assert.equal(understanding.billStreams.length, 1);
  assert.equal(understanding.billStreams[0].amount, 7.99);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("Matt Coulthard wages", 450, "2026-03-01", { category: "Wages" }),
      tx("Matt Coulthard wages", 450, "2026-03-08", { category: "Wages" }),
      tx("Matt Coulthard wages", 450, "2026-03-15", { category: "Wages" }),
      tx("Matt Coulthard wages", 450, "2026-03-22", { category: "Wages" }),
    ],
  });
  const appModel = buildAppMoneyModel({ moneyUnderstanding: understanding });

  assert.equal(appModel.income.payCycleSummary, "About £450.00/week from Matt Coulthard");
  assert.ok(appModel.income.monthlyEstimate > 1900);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("Rent to landlord", -1450, "2026-02-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-03-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-04-01", { category: "Rent", is_bill: true }),
      tx("Matt rent contribution", 725, "2026-02-01"),
      tx("Matt rent contribution", 725, "2026-03-01"),
      tx("Matt rent contribution", 725, "2026-04-01"),
    ],
  });
  const appModel = buildAppMoneyModel({ moneyUnderstanding: understanding });

  assert.equal(appModel.grossMonthlyBillTotal, 1450);
  assert.equal(appModel.monthlyBillTotal, 725);
  assert.equal(appModel.monthlyScheduledOutgoingsTotal, 725);
  assert.equal(appModel.income.monthlyEstimate, 0);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("Rent to landlord", -1450, "2026-02-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-03-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-04-01", { category: "Rent", is_bill: true }),
      tx("Faster payment from Jake", 725, "2026-02-01"),
      tx("Faster payment from Jake", 725, "2026-03-01"),
      tx("Faster payment from Jake", 725, "2026-04-01"),
    ],
  });
  const appModel = buildAppMoneyModel({ moneyUnderstanding: understanding });

  assert.equal(appModel.monthlyScheduledOutgoingsTotal, 725);
  assert.equal(appModel.income.monthlyEstimate, 0);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("Rent to landlord", -1450, "2026-02-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-03-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-04-01", { category: "Rent", is_bill: true }),
      tx("Faster payment from Jake", 725, "2026-01-30"),
      tx("Faster payment from Jake", 725, "2026-02-28"),
      tx("Faster payment from Jake", 725, "2026-04-03"),
    ],
  });
  const appModel = buildAppMoneyModel({ moneyUnderstanding: understanding });

  assert.equal(appModel.monthlyScheduledOutgoingsTotal, 725);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("Rent to landlord", -1450, "2026-02-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-03-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-04-01", { category: "Rent", is_bill: true }),
      tx("Faster payment from Jake", 800, "2026-02-01"),
      tx("Faster payment from Jake", 800, "2026-03-01"),
      tx("Faster payment from Jake", 800, "2026-04-01"),
    ],
  });
  const appModel = buildAppMoneyModel({ moneyUnderstanding: understanding });

  assert.equal(appModel.grossMonthlyBillTotal, 1450);
  assert.equal(appModel.monthlyBillTotal, 725);
  assert.equal(appModel.monthlyScheduledOutgoingsTotal, 725);
  assert.equal(appModel.income.monthlyEstimate, 0);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("Rent to landlord", -1450, "2026-02-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-03-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-04-01", { category: "Rent", is_bill: true }),
      tx("Faster payment from Jake", 725, "2026-02-01"),
      tx("Faster payment from Jake", 725, "2026-03-01"),
      tx("Faster payment from Jake", 900, "2026-04-01"),
    ],
  });
  const appModel = buildAppMoneyModel({ moneyUnderstanding: understanding });

  assert.equal(appModel.monthlyScheduledOutgoingsTotal, 725);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("Rent to landlord", -1450, "2026-02-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-03-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-04-01", { category: "Rent", is_bill: true }),
      tx("Faster payment from Jake", 725, "2026-02-01"),
      tx("Faster payment from Jake", 725, "2026-04-01"),
    ],
  });
  const appModel = buildAppMoneyModel({ moneyUnderstanding: understanding });

  assert.equal(appModel.monthlyScheduledOutgoingsTotal, 725);
  assert.equal(appModel.income.monthlyEstimate, 0);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("Rent to landlord", -1450, "2026-02-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-03-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-04-01", { category: "Rent", is_bill: true }),
      tx("Faster payment from Sam", 725, "2026-02-18"),
      tx("Faster payment from Sam", 725, "2026-03-18"),
      tx("Faster payment from Sam", 725, "2026-04-18"),
    ],
  });
  const appModel = buildAppMoneyModel({ moneyUnderstanding: understanding });

  assert.equal(appModel.monthlyScheduledOutgoingsTotal, 1450);
  assert.equal(appModel.sharedBillContributions.confirmed.length, 0);
  assert.ok(appModel.checksWaiting.some((check) => check.sharedContribution));
  assert.equal(appModel.income.monthlyEstimate, 0);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("Rent to landlord", -1450, "2026-02-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-03-01", { category: "Rent", is_bill: true }),
      tx("Rent to landlord", -1450, "2026-04-01", { category: "Rent", is_bill: true }),
      tx("Faster payment from Jake", 725, "2026-02-16"),
      tx("Faster payment from Jake", 725, "2026-03-07"),
      tx("Faster payment from Jake", 725, "2026-04-24"),
    ],
  });
  const appModel = buildAppMoneyModel({ moneyUnderstanding: understanding });

  assert.equal(appModel.monthlyScheduledOutgoingsTotal, 1450);
  assert.equal(appModel.sharedBillContributions.confirmed.length, 0);
  assert.ok(appModel.checksWaiting.some((check) => check.sharedContribution));
  assert.equal(appModel.income.monthlyEstimate, 0);
}

{
  const transactionRules = [{
    rule_type: "shared_bill_contribution",
    match_text: "Jake",
    match_amount: null,
    category: "Shared rent contribution",
    is_bill: false,
    is_subscription: false,
    is_internal_transfer: false,
    updated_at: "2026-04-02T00:00:00Z",
  }];
  const understanding = buildMoneyUnderstanding({
    transactionRules,
    transactions: [
      tx("Rent to landlord", -1450, "2026-04-01", { category: "Rent", is_bill: true }),
      tx("Faster payment from Jake", 725, "2026-04-01"),
    ],
  });
  const appModel = buildAppMoneyModel({ moneyUnderstanding: understanding });

  assert.equal(appModel.monthlyScheduledOutgoingsTotal, 725);
  assert.equal(appModel.income.monthlyEstimate, 0);
}

{
  const understanding = buildMoneyUnderstanding({
    transactions: [
      tx("Rent to landlord", -1450, "2026-04-01", { category: "Rent", is_bill: true }),
      tx("Faster payment from Jake", 725, "2026-04-01"),
    ],
  });
  const appModel = buildAppMoneyModel({ moneyUnderstanding: understanding });

  assert.equal(appModel.monthlyScheduledOutgoingsTotal, 1450);
  assert.equal(appModel.income.monthlyEstimate, 0);
  assert.ok(appModel.checksWaiting.some((check) => check.sharedContribution));
}

{
  const context = getStatementIntelligenceContext(
    [
      tx("Uber trip old", -100, "2026-02-01"),
      tx("Uber trip latest", -12.5, "2026-04-10"),
      tx("Uber ride latest", -7.25, "2026-04-28"),
      tx("Tesco latest", -20, "2026-04-29"),
    ],
    "How much did I spend on Uber in the latest 30 days of data you have on me?"
  );

  assert.equal(context.queryFocus.time_window.matched, true);
  assert.equal(context.queryFocus.time_window.start, "2026-03-30");
  assert.equal(context.queryFocus.time_window.end, "2026-04-29");
  assert.equal(context.queryFocus.direct_match_count, 2);
  assert.equal(context.queryFocus.direct_money_out, 19.75);
  assert.equal(context.queryFocus.relevant_money_total, 19.75);
  assert.ok(context.queryFocus.direct_match_note.includes("latest 30 days of uploaded data"));
}

{
  const context = getStatementIntelligenceContext(
    [
      tx("Faster payment from Alice", 40, "2026-02-05"),
      tx("Payment from Mum", 25, "2026-03-10"),
      tx("Transfer from Jake", 15, "2026-04-20"),
      tx("Payroll wages", 500, "2026-04-25", { category: "Wages" }),
      tx("Refund from Amazon", 99, "2026-04-26", { category: "Refund" }),
      tx("Rent to landlord", -700, "2026-04-01", { category: "Rent", is_bill: true }),
      tx("Card purchase Tesco", -30, "2026-04-26"),
      tx("Latest transaction", -1, "2026-04-29"),
    ],
    "How much have my family and friends sent me over the last few months?"
  );

  assert.equal(context.queryFocus.broad_personal_lookup, true);
  assert.equal(context.queryFocus.direction_intent, "incoming");
  assert.equal(context.queryFocus.time_window.matched, true);
  assert.equal(context.queryFocus.time_window.start, "2026-01-29");
  assert.equal(context.queryFocus.time_window.end, "2026-04-29");
  assert.equal(context.queryFocus.relevant_match_count, 3);
  assert.equal(context.queryFocus.relevant_money_total, 80);
  assert.ok(context.queryFocus.direct_match_note.includes("personal payments"));
}

{
  const { appModel } = buildModel([
    tx("Payroll wages", 1700, "2026-01-01", { category: "Wages" }),
    tx("Payroll wages", 1700, "2026-02-01", { category: "Wages" }),
    tx("Payroll wages", 1700, "2026-03-01", { category: "Wages" }),
    tx("Gaming Jan", -200, "2026-01-28", { category: "Gaming" }),
    tx("Gaming Feb", -300, "2026-02-28", { category: "Gaming" }),
    tx("Gaming Mar", -400, "2026-03-28", { category: "Gaming" }),
  ]);
  const facts = appModel.cleanMonthlyFacts;

  assert.equal(facts.raw_history_totals.outgoings, 900);
  assert.equal(facts.recent_monthly_average.real_spending, 300);
  assert.equal(facts.latest_full_month.real_spending, 400);
  assert.equal(facts.worst_recent_month.real_spending, 400);
  assert.ok(readFileSync("supabase/functions/ai-coach/index.ts", "utf8").includes("Never compare all-history totals to monthly income"));
}

{
  const { appModel } = buildModel([
    tx("Payroll wages", 1739, "2026-04-01", { category: "Wages" }),
    tx("Transfer to savings pot", -1000, "2026-04-02", { category: "Internal Transfer" }),
    tx("Own account transfer", -800, "2026-04-03", { category: "Internal Transfer" }),
    tx("Gaming", -80, "2026-04-10", { category: "Gaming" }),
    tx("Food shop", -250, "2026-04-12", { category: "Groceries" }),
    tx("Rent bill", -700, "2026-04-28", { category: "Rent", is_bill: true }),
  ]);
  const facts = appModel.cleanMonthlyFacts;

  assert.equal(facts.latest_full_month.real_spending, 1030);
  assert.equal(facts.latest_full_month.raw_outgoings, 2830);
  assert.equal(facts.latest_full_month.transfer_like_outgoings, 1800);
  assert.equal(facts.budget_sanity.raw_outgoings_likely_inflated, true);
  assert.ok(facts.uncertainty_flags.includes("raw_outgoings_likely_inflated"));
}

{
  const { appModel } = buildModel([
    tx("Rent to landlord", -1450, "2026-02-01", { category: "Rent", is_bill: true }),
    tx("Rent to landlord", -1450, "2026-03-01", { category: "Rent", is_bill: true }),
    tx("Rent to landlord", -1450, "2026-04-28", { category: "Rent", is_bill: true }),
    tx("Housemate rent contribution", 725, "2026-02-01"),
    tx("Housemate rent contribution", 725, "2026-03-01"),
    tx("Housemate rent contribution", 725, "2026-04-28"),
  ]);

  assert.equal(appModel.grossMonthlyBillTotal, 1450);
  assert.equal(appModel.monthlyScheduledOutgoingsTotal, 725);
  assert.equal(appModel.income.monthlyEstimate, 0);
  assert.equal(appModel.cleanMonthlyFacts.latest_full_month.bill_burden, 725);
}

{
  const { appModel } = buildModel([
    tx("Rent to landlord", -1450, "2026-04-01", { category: "Rent", is_bill: true }),
    tx("Faster payment from housemate", 725, "2026-03-30"),
  ]);
  const march = appModel.cleanMonthlyFacts.monthly_rows.find((row) => row.month === "2026-03");
  const april = appModel.cleanMonthlyFacts.monthly_rows.find((row) => row.month === "2026-04");

  assert.equal(appModel.income.monthlyEstimate, 0);
  assert.equal(march.real_income, 0);
  assert.equal(april.bill_burden, 1450);
  assert.ok(appModel.checksWaiting.some((check) => check.sharedContribution));
}

{
  const { appModel } = buildModel([
    tx("Shop purchase", -200, "2026-04-01", { category: "Shopping" }),
    tx("Shop refund", 200, "2026-04-28", { category: "Refund" }),
  ]);

  assert.equal(appModel.income.monthlyEstimate, 0);
  assert.equal(appModel.cleanMonthlyFacts.latest_full_month.refunds_and_reimbursements, 200);
  assert.equal(appModel.cleanMonthlyFacts.latest_full_month.real_spending, 0);
}

{
  const { appModel } = buildModel([
    tx("Gaming Jan", -50, "2026-01-28", { category: "Gaming" }),
    tx("Gaming Feb", -120, "2026-02-28", { category: "Gaming" }),
    tx("Gaming Mar", -240, "2026-03-28", { category: "Gaming" }),
  ]);

  assert.equal(appModel.cleanMonthlyFacts.trend.direction, "worsening");
  assert.ok(appModel.cleanMonthlyFacts.risky_accelerating_categories.some((item) => item.category === "Gaming"));
}

{
  const { appModel } = buildModel([
    tx("Eating out Jan", -300, "2026-01-28", { category: "Eating out" }),
    tx("Eating out Feb", -180, "2026-02-28", { category: "Eating out" }),
    tx("Eating out Mar", -90, "2026-03-28", { category: "Eating out" }),
  ]);

  assert.equal(appModel.cleanMonthlyFacts.trend.direction, "improving");
  assert.ok(appModel.cleanMonthlyFacts.categories_improving.some((item) => item.category === "Eating out"));
}

{
  const { appModel } = buildModel([
    tx("Only month food", -90, "2026-04-28", { category: "Groceries" }),
  ]);

  assert.equal(appModel.cleanMonthlyFacts.trend.direction, "unclear");
}

{
  const manyTransactions = Array.from({ length: 1000 }, (_, index) =>
    tx(`Tesco shop ${index}`, -5, `2026-04-${String((index % 28) + 1).padStart(2, "0")}`, { category: "Groceries" })
  );
  const { understanding, appModel } = buildModel(manyTransactions);
  const context = buildCoachContext({
    transactions: understanding.transactions,
    debts: [],
    investments: [],
    debtSignals: [],
    investmentSignals: [],
    totals: { income: 0, spending: 0, bills: 0 },
    topCategories: [],
    subscriptionSummary: {},
    dataFreshness: appModel.dataFreshness,
    baseMessages: [],
    userMessage: "What should I fix?",
    subscriptionStatus: "free",
    bankFeedReadiness: {},
    moneyUnderstanding: understanding,
    appMoneyModel: appModel,
  });

  assert.ok(context.clean_monthly_facts.latest_full_month);
  assert.ok(context.clean_monthly_facts.recent_monthly_average);
  assert.ok(context.searchable_transactions.length <= 350);
  assert.ok(context.recent_transactions.length <= 20);
  assert.equal(context.clean_monthly_facts.monthly_rows.length, 1);
}

await server.close();
console.log("money understanding checks passed");
