import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true },
});

const { buildMoneyUnderstanding } = await server.ssrLoadModule("/src/lib/moneyUnderstanding.js");

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

await server.close();
console.log("money understanding checks passed");
