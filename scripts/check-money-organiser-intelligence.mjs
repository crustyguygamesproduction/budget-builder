import assert from "node:assert/strict";
import { buildTransactionIntelligence, normaliseCounterparty } from "../supabase/functions/_shared/moneyOrganiserIntelligence.js";

function tx(id, date, description, amount, overrides = {}) {
  return {
    id,
    date,
    description,
    merchant: overrides.merchant || description,
    amount,
    direction: amount >= 0 ? "in" : "out",
    category: overrides.category || "Bills",
    is_bill: Boolean(overrides.is_bill),
    is_subscription: Boolean(overrides.is_subscription),
    is_internal_transfer: Boolean(overrides.is_internal_transfer),
    is_income: Boolean(overrides.is_income),
  };
}

function findByCounterparty(items, text) {
  return items.find((item) => String(item.counterparty || "").includes(text));
}

const rows = [
  tx("rent-1", "2026-01-01", "Rent payment part 1", -700, { category: "Rent", is_bill: true }),
  tx("rent-2", "2026-01-15", "Rent payment part 2", -700, { category: "Rent", is_bill: true }),
  tx("rent-3", "2026-02-01", "Rent payment part 1", -700, { category: "Rent", is_bill: true }),
  tx("rent-4", "2026-02-15", "Rent payment part 2", -700, { category: "Rent", is_bill: true }),
  tx("noisy-ee-1", "2026-01-05", "CARD PAYMENT EE 123456", -16.22, { category: "Phone", is_bill: true }),
  tx("noisy-ee-2", "2026-02-05", "EE CARD PURCHASE 987654", -16.24, { category: "Phone", is_bill: true }),
  tx("annual-1", "2026-03-12", "Annual home insurance", -240, { category: "Insurance", is_bill: true }),
  tx("transfer-1", "2026-03-13", "Transfer to savings", -500, { category: "Transfer", is_internal_transfer: true }),
  tx("takeaway-1", "2026-03-14", "Pizza Place", -22.5, { category: "Eating out" }),
];

const intelligence = buildTransactionIntelligence(rows);

assert.equal(normaliseCounterparty("CARD PAYMENT EE 123456"), "unknown", "numeric card boilerplate should be stripped when no merchant remains");
assert.ok(intelligence.recurring_candidates.length > 0, "expected recurring candidates");
assert.ok(findByCounterparty(intelligence.recurring_candidates, "rent"), "split/recurring rent should appear as a recurring candidate");
assert.ok(intelligence.split_payment_candidates.some((item) => item.counterparty.includes("rent") && item.month === "2026-01"), "January split rent should be flagged");
assert.ok(intelligence.split_payment_candidates.some((item) => item.counterparty.includes("rent") && item.month === "2026-02"), "February split rent should be flagged");
assert.ok(intelligence.annual_or_rare_commitment_candidates.some((item) => item.counterparty.includes("annual home insurance")), "one-off annual insurance should be retained as a rare commitment candidate");
assert.ok(!intelligence.recurring_candidates.some((item) => item.flags.is_internal_transfer), "internal transfers must not be recurring bill candidates");
assert.ok(intelligence.representative_raw_sample.some((item) => item.id === "annual-1"), "annual candidate should remain in representative sample");
assert.ok(intelligence.large_outgoing_samples.length > 0, "large outgoing samples should be available");

const maxed = buildTransactionIntelligence(rows, {
  maxRecurringCandidates: 1,
  maxAnnualCandidates: 1,
  maxSplitPaymentCandidates: 1,
  maxRepresentativeRows: 3,
});
assert.ok(maxed.recurring_candidates.length <= 1, "recurring cap should apply");
assert.ok(maxed.annual_or_rare_commitment_candidates.length <= 1, "annual candidate cap should apply");
assert.ok(maxed.split_payment_candidates.length <= 1, "split candidate cap should apply");
assert.ok(maxed.representative_raw_sample.length <= 3, "representative sample cap should apply");

console.log("Money organiser intelligence checks passed");
