import { normalizeText } from "./finance";

export const KNOWN_REAL_WORLD_MERCHANTS = [
  { key: "ee", name: "EE", type: "phone", bill: true, regex: /\bee\b|\bee limited\b|\bee ltd\b/ },
  { key: "o2", name: "O2", type: "phone", bill: true, regex: /\bo2\b|\btelefonica\b/ },
  { key: "vodafone", name: "Vodafone", type: "phone", bill: true, regex: /\bvodafone\b|\bvoxi\b/ },
  { key: "three", name: "Three", type: "phone", bill: true, regex: /\bthree\b|\b3 mobile\b|\bh3g\b/ },
  { key: "giffgaff", name: "Giffgaff", type: "phone", bill: true, regex: /\bgiffgaff\b/ },
  { key: "smarty", name: "Smarty", type: "phone", bill: true, regex: /\bsmarty\b/ },
  { key: "lebara", name: "Lebara", type: "phone", bill: true, regex: /\blebara\b/ },
  { key: "id mobile", name: "iD Mobile", type: "phone", bill: true, regex: /\bid mobile\b|\bidmobile\b/ },
  { key: "sky mobile", name: "Sky Mobile", type: "phone", bill: true, regex: /\bsky mobile\b/ },
  { key: "bt", name: "BT", type: "broadband", bill: true, regex: /\bbt\b|\bbt group\b|\bbt broadband\b/ },
  { key: "virgin media", name: "Virgin Media", type: "broadband", bill: true, regex: /\bvirgin media\b/ },
  { key: "talktalk", name: "TalkTalk", type: "broadband", bill: true, regex: /\btalktalk\b/ },
  { key: "plusnet", name: "Plusnet", type: "broadband", bill: true, regex: /\bplusnet\b/ },
  { key: "sky", name: "Sky", type: "broadband", bill: true, regex: /\bsky digital\b|\bsky tv\b|\bsky broadband\b/ },
  { key: "eon next", name: "E.ON Next", type: "energy", bill: true, regex: /\be\s?on\s?next\b|\beon next\b|\beon\b/ },
  { key: "octopus energy", name: "Octopus Energy", type: "energy", bill: true, regex: /\boctopus\b/ },
  { key: "british gas", name: "British Gas", type: "energy", bill: true, regex: /\bbritish gas\b/ },
  { key: "edf", name: "EDF", type: "energy", bill: true, regex: /\bedf\b/ },
  { key: "ovo", name: "OVO", type: "energy", bill: true, regex: /\bovo\b/ },
  { key: "scottish power", name: "Scottish Power", type: "energy", bill: true, regex: /\bscottish power\b/ },
  { key: "utilita", name: "Utilita", type: "energy", bill: true, regex: /\butilita\b/ },
  { key: "thames water", name: "Thames Water", type: "water", bill: true, regex: /\bthames water\b/ },
  { key: "southern water", name: "Southern Water", type: "water", bill: true, regex: /\bsouthern water\b/ },
  { key: "wessex water", name: "Wessex Water", type: "water", bill: true, regex: /\bwessex water\b/ },
  { key: "council tax", name: "Council Tax", type: "council_tax", bill: true, regex: /\bcouncil tax\b|\bborough council\b|\bcity council\b|\bdistrict council\b|\bcounty council\b/ },
  { key: "tv licence", name: "TV Licence", type: "tv_licence", bill: true, regex: /\btv licen[cs]e\b/ },
  { key: "netflix", name: "Netflix", type: "subscription", subscription: true, regex: /\bnetflix\b/ },
  { key: "spotify", name: "Spotify", type: "subscription", subscription: true, regex: /\bspotify\b/ },
  { key: "amazon prime", name: "Amazon Prime", type: "subscription", subscription: true, regex: /\bamazon prime\b|\bprime video\b/ },
  { key: "apple", name: "Apple", type: "subscription", subscription: true, regex: /\bapple\.com\b|\bapple services\b|\bicloud\b/ },
  { key: "google", name: "Google", type: "subscription", subscription: true, regex: /\bgoogle\b|\byoutube premium\b/ },
  { key: "openai", name: "OpenAI", type: "subscription", subscription: true, regex: /\bopenai\b|\bchatgpt\b/ },
  { key: "microsoft", name: "Microsoft", type: "subscription", subscription: true, regex: /\bmicrosoft\b|\bxbox\b/ },
  { key: "sony playstation", name: "PlayStation", type: "subscription", subscription: true, regex: /\bplaystation\b|\bsony interactive\b/ },
  { key: "clearpay", name: "Clearpay", type: "debt", bill: true, regex: /\bclearpay\b/ },
  { key: "klarna", name: "Klarna", type: "debt", bill: true, regex: /\bklarna\b/ },
  { key: "paypal credit", name: "PayPal Credit", type: "debt", bill: true, regex: /\bpaypal credit\b/ },
  { key: "trading 212", name: "Trading 212", type: "investment", regex: /\btrading 212\b|\btrading212\b/ },
  { key: "vanguard", name: "Vanguard", type: "investment", regex: /\bvanguard\b/ },
  { key: "mynextbike", name: "Mynextbike", type: "work_money", regex: /\bmynextbike\b|\bmy next bike\b/ },
  { key: "proovia", name: "Proovia", type: "work_money", regex: /\bproovia\b/ },
];

const GENERIC_PAYMENT_WORDS = /\b(card purchase|debit card|credit card|direct debit|dd|standing order|faster payment|bank transfer|contactless|online payment|payment to|payment from|mobile payment|transaction|purchase|ref|reference|visa|mastercard|pos|fpi|fp|so|monthly|subscription)\b/g;

export function getRealWorldMerchant(transactionOrText) {
  const raw = typeof transactionOrText === "string"
    ? transactionOrText
    : [
        transactionOrText?.description,
        transactionOrText?.merchant,
        transactionOrText?.counterparty,
        transactionOrText?.category,
        transactionOrText?._smart_category,
      ].join(" ");
  const text = normalizeText(raw);
  if (!text) return { key: "", name: "", type: "", bill: false, subscription: false, known: false, cleanKey: "" };

  const known = KNOWN_REAL_WORLD_MERCHANTS.find((merchant) => merchant.regex.test(text));
  if (known) {
    return {
      key: known.key,
      name: known.name,
      type: known.type,
      bill: Boolean(known.bill),
      subscription: Boolean(known.subscription),
      known: true,
      cleanKey: `known:${known.key}`,
    };
  }

  const cleanKey = makeCleanMerchantKey(text);
  return {
    key: cleanKey,
    name: titleCase(cleanKey) || "Unknown",
    type: "",
    bill: false,
    subscription: false,
    known: false,
    cleanKey: cleanKey ? `text:${cleanKey}` : "",
  };
}

export function makeCleanMerchantKey(value) {
  return normalizeText(value)
    .replace(GENERIC_PAYMENT_WORDS, " ")
    .replace(/\b[a-z]{2,}\d{3,}\b/g, " ")
    .replace(/\b\d+[a-z]+\d*\b/g, " ")
    .replace(/\b\d{2,}\b/g, " ")
    .replace(/[^a-z0-9&.'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 5)
    .join(" ");
}

export function getFriendlyTransactionName(transaction) {
  const merchant = getRealWorldMerchant(transaction);
  if (merchant.known) return merchant.name;
  return merchant.name || String(transaction?.description || "Transaction").trim() || "Transaction";
}

export function getSmartBillCategory(transaction) {
  const merchant = getRealWorldMerchant(transaction);
  if (merchant.type === "phone") return "Phone";
  if (merchant.type === "energy") return "Energy";
  if (merchant.type === "water") return "Water";
  if (merchant.type === "broadband") return "Broadband";
  if (merchant.type === "council_tax") return "Council Tax";
  if (merchant.type === "tv_licence") return "TV Licence";
  if (merchant.type === "debt") return "Debt / Credit";
  if (merchant.type === "subscription") return "Subscription";
  if (merchant.type === "investment") return "Investments";
  if (merchant.type === "work_money") return "Work / pass-through";
  return "";
}

export function looksLikeKnownBill(transaction) {
  const merchant = getRealWorldMerchant(transaction);
  return Boolean(merchant.bill || merchant.subscription);
}

export function looksLikeKnownSubscription(transaction) {
  return Boolean(getRealWorldMerchant(transaction).subscription);
}

export function titleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      if (["ee", "o2", "bt", "edf", "ovo"].includes(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}
