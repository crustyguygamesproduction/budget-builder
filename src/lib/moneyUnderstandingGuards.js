import { normalizeText } from "./finance";

const ALLOWED_KINDS = new Set(["rent", "mortgage", "council_tax", "energy", "water", "broadband", "phone", "insurance", "debt", "childcare", "subscription", "other_bill", "bill"]);
const EVERYDAY_SPEND = /\b(chickie|chicken|takeaway|restaurant|mcdonald|kfc|burger king|subway|greggs|deliveroo|uber eats|just eat|cafe|coffee|bar|pub|tesco|aldi|lidl|asda|sainsbury|morrisons|one stop|premier|shop|store|vinted|ebay|amazon marketplace|fuel|petrol|parking|cash withdrawal|atm|gaming|lvl up|xsolla)\b/;
const ENTERTAINMENT_MERCHANT = /\b(odeon|cinema|cineworld|vue|theatre|bowling)\b/;
const FIXED_BILL_WORDS = /\b(rent|mortgage|landlord|letting|council tax|eon|e\.on|e on|energy|electric|electricity|gas|water|broadband|internet|wifi|phone|mobile|sim|contract|insurance|loan|credit|finance|clearpay|klarna|childcare|nursery|subscription|netflix|spotify|apple|itunes|icloud|google|openai|chatgpt|amazon prime|prime video|disney|microsoft)\b/;

export function cleanBillName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^(\b.+?\b)\s+\1\b/i, "$1")
    .trim();
}

export function getBillBaseName(value) {
  return normalizeProviderName(value);
}

function normalizeProviderName(value) {
  const original = normalizeText(cleanBillName(value));

  const withoutMoney = original
    .replace(/£?\d+(\.\d{1,2})?/g, " ")
    .replace(/\b\d{4,}\b/g, " ");

  const withoutNoise = withoutMoney
    .replace(/\b(bill around|around|bill|subscription|spending|payment|payments|direct debit|debit|dd|standing order|so|regular|monthly|estimated|estimate|expected|usual|amount|from|to|card|visa|mastercard|faster|bank|transfer|reference|ref)\b/g, " ")
    .replace(/\b(energy|electric|electricity|gas|broadband|internet|wifi|phone|mobile|insurance|rent|mortgage|water|council|tax|loan|finance|credit)\b/g, " ")
    .replace(/[^a-z0-9\s.&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = withoutNoise
    .split(" ")
    .filter(Boolean)
    .filter((token) => token.length > 1)
    .filter((token) => !/^\d+$/.test(token));

  return tokens.slice(0, 3).join(" ") || withoutNoise || original;
}

export function isAllowedBillStream(stream) {
  const name = cleanBillName(stream?.name || stream?.title || "");
  const kind = normalizeText(stream?.kind || "bill").replace(/ /g, "_");
  const amount = Math.abs(Number(stream?.amount ?? stream?.usual_amount ?? 0));
  const text = normalizeText(`${name} ${kind} ${stream?.note || ""} ${stream?.evidence || ""}`);
  if (!amount || !Number.isFinite(amount)) return false;
  if (amount > 2000 && !/mortgage|debt|loan|finance/.test(text)) return false;
  if (!ALLOWED_KINDS.has(kind)) return false;
  if (/work|pass.?through|investment|trading|proovia|mynextbike/.test(text)) return false;
  if (EVERYDAY_SPEND.test(text) && !/debt|credit|finance|clearpay|klarna|subscription/.test(text)) return false;
  if (ENTERTAINMENT_MERCHANT.test(text) && /energy|water|broadband|phone|insurance|council|rent|mortgage/.test(text)) return false;
  return FIXED_BILL_WORDS.test(text) || ["rent", "mortgage", "energy", "water", "broadband", "phone", "insurance", "debt", "childcare", "subscription", "council_tax"].includes(kind);
}

export function mergeBillStreams(primary = [], fallback = []) {
  const merged = [...primary, ...fallback]
    .filter(isAllowedBillStream)
    .reduce((list, stream) => {
      const normal = {
        ...stream,
        name: cleanBillName(stream.name || stream.title || "Bill"),
        amount: Math.abs(Number(stream.amount ?? stream.usual_amount ?? 0)),
        day: Math.max(1, Math.min(Number(stream.day ?? stream.usual_day ?? 1) || 1, 28)),
        kind: normalizeText(stream.kind || "bill").replace(/ /g, "_") || "bill",
      };
      const base = getBillBaseName(normal.name);
      const matchIndex = list.findIndex((existing) => {
        const existingBase = getBillBaseName(existing.name);
        const closeAmount = Math.abs(Number(existing.amount || 0) - Number(normal.amount || 0)) <= Math.max(3, Number(normal.amount || 0) * 0.12);
        const closeDay = Math.abs(Number(existing.day || 0) - Number(normal.day || 0)) <= 5;
        const sameProvider = base && existingBase && (base === existingBase || base.includes(existingBase) || existingBase.includes(base));
        const sameKind = normal.kind === existing.kind || normal.kind === "bill" || existing.kind === "bill" || normal.kind === "other_bill" || existing.kind === "other_bill";
        const duplicateMonthlyEstimate = sameProvider && sameKind && closeAmount;
        return existing.key === normal.key || (duplicateMonthlyEstimate && (closeDay || scoreStream(normal) !== scoreStream(existing)));
      });
      if (matchIndex < 0) return [...list, normal];
      const current = list[matchIndex];
      const better = scoreStream(normal) > scoreStream(current) ? normal : current;
      return list.map((item, index) => (index === matchIndex ? better : item));
    }, []);

  return collapseDependentRentStreams(merged)
    .sort((a, b) => Number(a.day || 0) - Number(b.day || 0) || Number(b.amount || 0) - Number(a.amount || 0));
}

function collapseDependentRentStreams(streams) {
  const rentStreams = streams.filter((stream) => normalizeText(`${stream.kind} ${stream.name}`).includes("rent"));
  if (rentStreams.length < 2) return streams;

  const largestRent = rentStreams.slice().sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
  const largestAmount = Number(largestRent.amount || 0);

  return streams.filter((stream) => {
    const text = normalizeText(`${stream.kind} ${stream.name}`);
    if (!text.includes("rent")) return true;
    if (stream === largestRent || stream.key === largestRent.key) return true;
    const amount = Number(stream.amount || 0);
    const sameDay = Math.abs(Number(stream.day || 0) - Number(largestRent.day || 0)) <= 4;
    const looksLikeHalfOrPartPayment = amount < largestAmount && amount >= largestAmount * 0.35 && amount <= largestAmount * 0.75;
    return !(sameDay && looksLikeHalfOrPartPayment);
  });
}

function scoreStream(stream) {
  const confidence = normalizeText(stream.confidence || stream.confidenceLabel || "");
  const name = normalizeText(stream.name || stream.title || "");
  const note = normalizeText(stream.note || stream.estimateNote || stream.evidence || "");
  const key = normalizeText(stream.key || "");
  const confirmedBonus = key.startsWith("confirmed:") || note.includes("you confirmed") ? 10 : 0;
  const sourceScore =
    (confidence === "high" ? 4 : confidence === "medium" ? 3 : confidence === "estimated" ? 2 : confidence === "good" ? 2 : 1) +
    Number(stream.sourceMonths || 0) +
    Number(stream.sourceCount || 0) / 10;

  const noisyNamePenalty =
    name.includes("spending") || name.includes("around") || /£?\d+(\.\d{1,2})?/.test(name)
      ? -2
      : 0;

  return confirmedBonus + sourceScore + noisyNamePenalty;
}
