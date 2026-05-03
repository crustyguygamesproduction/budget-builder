import assert from "node:assert/strict";
import {
  validateSensitiveFileContent,
  validateStatementCsvFileContent,
} from "../src/lib/security.js";

function makeFile(parts, name, type = "") {
  const blob = new Blob(parts, { type });
  return {
    name,
    type,
    size: blob.size,
    slice: (...args) => blob.slice(...args),
  };
}

async function expectOk(result, label) {
  assert.equal(result.ok, true, `${label}: expected ok, got ${result.message || "not ok"}`);
}

async function expectRejected(result, label) {
  assert.equal(result.ok, false, `${label}: expected rejection`);
}

await expectOk(
  await validateStatementCsvFileContent(
    makeFile(["Date,Description,Amount\n2026-04-01,Tesco,-12.34\n"], "statement.csv", "text/csv")
  ),
  "normal CSV"
);

await expectRejected(
  await validateStatementCsvFileContent(
    makeFile([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])], "renamed.csv", "text/csv")
  ),
  "renamed binary CSV"
);

await expectOk(
  await validateSensitiveFileContent(
    makeFile([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])], "document.pdf", "application/pdf")
  ),
  "real PDF signature"
);

await expectRejected(
  await validateSensitiveFileContent(
    makeFile(["not actually a pdf"], "fake.pdf", "application/pdf")
  ),
  "fake PDF"
);

await expectRejected(
  await validateSensitiveFileContent(
    makeFile([new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32])], "fake.heic", "image/heic")
  ),
  "non-HEIC ISO media file"
);

await expectOk(
  await validateSensitiveFileContent(
    makeFile([new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00])], "photo.heic", "image/heic")
  ),
  "HEIC ftyp brand"
);

console.log("security validation checks passed");
