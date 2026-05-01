import { normalizeText } from "./finance";

const CATEGORY_RULES = [
  { category: "Income", test: ({ text, amount }) => amount > 0 && /salary|payroll|wage|paye|bonus|hmrc|universal credit|child benefit/.test(text) },
  { category: "Internal Transfer", test: ({ text }) => /transfer to|transfer from|to savings|from savings|standing order to|between accounts|own account|monzo pot|savings pot/.test(text) },
  { category: "Rent", bill: true, test: ({ text, amount }) => amount < 0 && /rent|landlord|letting|property|miss sarah halfacree|sarah halfacree|halfacree/.test(text) },
  { category: "Mortgage", bill: true, test: ({ text }) => /mortgage|halifax mortgage|nationwide mortgage|barclays mortgage/.test(text) },
  { category: "Council Tax", bill: true, test: ({ text }) => /council tax|council/.test(text) },
  { category: "Energy", bill: true, test: ({ text }) => /electric|gas|octopus|ovo|eon|edf|british gas|shell energy/.test(text) },
  { category: "Water", bill: true, test: ({ text }) => /water|thames water|severn trent|united utilities/.test(text) },
  { category: "Broadband", bill: true, test: ({ text }) => /broadband|internet|virgin media|sky|bt|ee broadband|talktalk|vodafone/.test(text) },
  { category: "Phone", bill: true, test: ({ text }) => /phone|mobile|o2|ee limited|giffgaff|three|vodafone/.test(text) },
  { category: "Insurance", bill: true, test: ({ text }) => /insurance|aviva|admiral|direct line|legal and general/.test(text) },
  { category: "Subscription", subscription: true, test: ({ text }) => /netflix|spotify|prime|amazon prime|apple\.com|apple services|google storage|disney|adobe|icloud|youtube premium|now tv|patreon|chatgpt|openai/.test(text) },
  { category: "Groceries", test: ({ text }) => /tesco|aldi|lidl|asda|sainsbury|waitrose|morrisons|co-op|marks and spencer|ocado|iceland|farmfoods/.test(text) },
  { category: "Fuel", test: ({ text }) => /shell|bp|esso|texaco|jet petrol|fuel|petrol station/.test(text) },
  { category: "Takeaway", test: ({ text }) => /deliveroo|uber eats|just eat|domino|pizza hut|kfc|mcdonald|burger king/.test(text) },
  { category: "Coffee & Snacks", test: ({ text }) => /costa|starbucks|greggs|pret|caffe nero|subway/.test(text) },
  { category: "Transport", test: ({ text }) => /uber|bolt|trainline|tfl|national rail|bus|parking|ringgo|paybyphone|railway|train/.test(text) },
  { category: "Shopping", test: ({ text }) => /amazon|etsy|ebay|argos|b&m|home bargains|ikea|currys|john lewis|very|asos|next plc/.test(text) },
  { category: "Health", test: ({ text }) => /pharmacy|boots|superdrug|dentist|doctor|optician|specsavers|vision express/.test(text) },
  { category: "Pets", test: ({ text }) => /pets at home|vets|veterinary|pet insurance/.test(text) },
  { category: "Cash", test: ({ text }) => /cash withdrawal|atm/.test(text) },
];

export function inferTransactionCategory(description, amount, options = {}) {
  const text = normalizeText(description);
  const numericAmount = Number(amount || 0);
  const matchedRule = CATEGORY_RULES.find((rule) => rule.test({ text, amount: numericAmount, options }));

  if (matchedRule) {
    return {
      category: matchedRule.category,
      is_bill: Boolean(matchedRule.bill),
      is_subscription: Boolean(matchedRule.subscription),
      is_internal_transfer: matchedRule.category === "Internal Transfer",
      is_income: matchedRule.category === "Income",
      confidence: 0.88,
    };
  }

  return {
    category: numericAmount > 0 ? "Income" : "Spending",
    is_bill: false,
    is_subscription: false,
    is_internal_transfer: false,
    is_income: numericAmount > 0,
    confidence: 0.45,
  };
}

export function inferRecurringPersonalBills(transactions) {
  const groups = new Map();

  transactions.forEach((transaction) => {
    const amount = Math.abs(Number(transaction.amount || 0));
    if (Number(transaction.amount) >= 0 || amount < 350) return;
    const text = normalizeText(transaction.description)
      .replace(/\b(faster payment|standing order|bank transfer|payment to|fpi|ref|reference|mobile payment)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return;
    const key = `${text}|${amount.toFixed(0)}`;
    if (!groups.has(key)) groups.set(key, { text, amount, transactions: [] });
    groups.get(key).transactions.push(transaction);
  });

  return [...groups.values()].filter((group) => {
    const months = new Set(group.transactions.map((transaction) => String(transaction.transaction_date || "").slice(0, 7)));
    return months.size >= 2 && /miss|mrs|mr|ms|mstr|sarah|rent|landlord|halfacree/.test(group.text);
  });
}
