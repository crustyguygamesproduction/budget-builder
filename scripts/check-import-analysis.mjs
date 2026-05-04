import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configLoader: "native",
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true },
});

const {
  getImportFingerprint,
  getImportOverlapSummary,
  getLegacyImportFingerprint,
} = await server.ssrLoadModule("/src/lib/importAnalysis.js");

const rows = [
  { date: "2026-04-01", description: "Tesco", amount: -12.34 },
  { date: "2026-04-02", description: "Wages", amount: 450 },
  { date: "2026-04-03", description: "Rent", amount: -800 },
];

const sameRowsDifferentOrder = [rows[2], rows[0], rows[1]];

assert.equal(
  getImportFingerprint(rows),
  getImportFingerprint(sameRowsDifferentOrder),
  "content fingerprint should ignore row order"
);

assert.equal(
  getImportFingerprint(rows),
  getImportFingerprint(rows.map((row) => ({ ...row }))),
  "content fingerprint should ignore file name and object identity"
);

assert.notEqual(
  getLegacyImportFingerprint("april.csv", rows),
  getLegacyImportFingerprint("renamed.csv", rows),
  "legacy fingerprint keeps filename for old database matching"
);

const overlap = getImportOverlapSummary(rows, [
  { transaction_date: "2026-04-01", description: "Tesco", amount: -12.34 },
  { transaction_date: "2026-04-02", description: "Wages", amount: 450 },
  { transaction_date: "2026-04-03", description: "Rent", amount: -800 },
]);

assert.equal(overlap.count, 3, "overlap should count exact existing rows");
assert.equal(overlap.ratio, 1, "overlap ratio should show a fully repeated upload");

console.log("import analysis checks passed");

await server.close();
