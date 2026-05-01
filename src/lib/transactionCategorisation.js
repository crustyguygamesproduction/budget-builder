import { normalizeText, parseAppDate } from "./finance";

const CATEGORY_RULES = [
  { category: "Income", test: ({ text, amount }) => amount > 0 && /salary|payroll|wage|paye|bonus|hmrc|universal credit|child benefit|pension credit|tax credit/.test(text) },
  { category: "Internal Transfer", test: ({ text }) => /transfer to|transfer from|to savings|from savings|standing order to|between accounts|own account|monzo pot|savings pot|round up|pot transfer/.test(text) },
  { category: "Rent", bill: true, test: ({ text, amount }) => amount < 0 && /rent|landlord|letting|property management|housing/.test(text) },
  { category: "Mortgage", bill: true, test: ({ text }) => /mortgage|home loan|halifax mortgage|nationwide mortgage|barclays mortgage|santander mortgage/.test(text) },
  { category: "Council Tax", bill: true, test: ({ text }) => /council tax|district council|borough council|city council|county council/.test(text) },
  { category: "Energy", bill: true, test: ({ text }) => /electric|electricity|gas|energy|utility|utilities|octopus|ovo|eon|e on|edf|british gas|shell energy|bulb|utilita|so energy|scottish power|eon next/.test(text) },
  { category: "Water", bill: true, test: ({ text }) => /water|thames water|severn trent|united utilities|southern water|wessex water|anglian water|south west water|yorkshire water|northumbrian water/.test(text) },
  { category: "Broadband", bill: true, test: ({ text }) => /broadband|internet|wifi|fibre|virgin media|sky broadband|bt broadband|talktalk|plusnet|vodafone broadband|ee broadband|hyperoptic|community fibre|zen internet/.test(text) },
  { category: "Phone", bill: true, test: ({ text }) => /phone|mobile|sim only|airtime|o2|ee limited|\bee\b|giffgaff|three|3 mobile|vodafone|voxi|tesco mobile|lebara|lyca|id mobile|smarty|sky mobile|bt mobile/.test(text) },
  { category: "Insurance", bill: true, test: ({ text }) => /insurance|assurance|aviva|admiral|direct line|legal and general|lv insurance|hastings|churchill|axa|rsa|more than|esure|policy expert|compare the market/.test(text) },
  { category: "Debt / Credit", bill: true, test: ({ text }) => /loan repayment|credit card|minimum payment|finance agreement|klarna|clearpay|paypal credit|barclaycard|capital one|aqua card|vanquis|zopa|118 118 money/.test(text) },
  { category: "Childcare", bill: true, test: ({ text }) => /childcare|nursery|school fees|after school club|breakfast club/.test(text) },
  { category: "Subscription", subscription: true, test: ({ text }) => /subscription|membership|premium|netflix|spotify|prime|amazon prime|apple\.com|apple services|google storage|disney|adobe|icloud|youtube premium|now tv|patreon|chatgpt|openai|odeon|odeon cinemas|odeon limitless|microsoft|xbox|playstation|audible|strava|duolingo|notion|dropbox|github/.test(text) },
  { category: "Groceries", test: ({ text }) => /tesco|aldi|lidl|asda|sainsbury|waitrose|morrisons|co-op|co op|marks and spencer|ocado|iceland|farmfoods/.test(text) },
  { category: "Fuel", test: ({ text }) => /shell|bp|esso|texaco|jet petrol|fuel|petrol station/.test(text) },
  { category: "Takeaway", test: ({ text }) => /deliveroo|uber eats|just eat|domino|pizza hut|kfc|mcdonald|burger king|chickie|magic kitchen/.test(text) },
  { category: "Coffee & Snacks", test: ({ text }) => /costa|starbucks|greggs|pret|caffe nero|subway/.test(text) },
  { category: "Transport", test: ({ text }) => /uber|bolt|trainline|tfl|national rail|bus|parking|ringgo|paybyphone|railway|train|beryl|south coast travel/.test(text) },
  { category: "Shopping", test: ({ text }) => /amazon|etsy|ebay|argos|b&m|home bargains|ikea|currys|john lewis|very|asos|next plc|vinted/.test(text) },
  { category: "Gaming", test: ({ text }) => /xbox|playstation|steam|xsolla|lvl up|sp lvl up|nintendo|epic games/.test(text) },
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
      confidence: 0.9,
    };
  }

  const looksLikeBill = numericAmount < 0 && hasGenericBillSignal(text);

  return {
    category: numericAmount > 0 ? "Income" : looksLikeBill ? "Major bill" : "Spending",
    is_bill: looksLikeBill,
    is_subscription: false,
    is_internal_transfer: false,
    is_income: numericAmount > 0,
    confidence: looksLikeBill ? 0.62 : 0.45,
  };
}

export function getRuleMerchantKey(description) {
  return normalizeText(description)
    .replace(/\b(faster payment|standing order|bank transfer|payment to|payment from|mobile payment|card payment|direct debit|debit card|credit card|fpi|ref|reference|dd|so|pos|visa)\b/g, " ")
    .replace(/\b\d{2,}\b/g, " ")
    .replace(/[^\w\s&.'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getMatchingTransactionRule(transaction, transactionRules = []) {
  const text = normalizeText(transaction?.description);
  const merchantKey = getRuleMerchantKey(transaction?.description);
  const amount = Math.abs(Number(transaction?.amount || 0));

  return (transactionRules || []).find((rule) => {
    const matchText = normalizeText(rule?.match_text);
    if (!matchText) return false;

    const textMatches =
      text.includes(matchText) ||
      merchantKey.includes(matchText) ||
      (merchantKey.length >= 8 && matchText.length >= 8 && matchText.includes(merchantKey));

    if (!textMatches) return false;

    const ruleAmount = Math.abs(Number(rule?.match_amount || 0));
    if (ruleAmount > 0 && Math.abs(amount - ruleAmount) > 1) return false;

    return true;
  });
}

export function buildRecurringMajorPaymentCandidates(transactions, transactionRules = []) {
  const groups = new Map();

  (transactions || []).forEach((transaction) => {
    const amount = Math.abs(Number(transaction?.amount || 0));
    if (Number(transaction?.amount || 0) >= 0 || amount < 75) return;
    if (transaction?._smart_internal_transfer || transaction?.is_internal_transfer) return;
    if (getMatchingTransactionRule(transaction, transactionRules)) return;

    const text = normalizeText(transaction?.description);
    if (/transfer to|transfer from|own account|between accounts|to savings|from savings|monzo pot|savings pot/.test(text)) return;
    if (isLikelyEverydaySpend(text) && amount < 350) return;

    const merchantKey = getRuleMerchantKey(transaction?.description);
    if (!merchantKey || merchantKey.length < 4) return;

    const date = parseAppDate(transaction?.transaction_date);
    if (!date) return;

    const amountBand = Math.round(amount / 5) * 5;
    const key = `${merchantKey}|${amountBand}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        matchText: merchantKey,
        label: toTitleCase(merchantKey).slice(0, 48),
        amount,
        amountBand,
        transactions: [],
        months: new Set(),
        billSignalCount: 0,
        mechanismSignalCount: 0,
      });
    }

    const group = groups.get(key);
    group.transactions.push(transaction);
    group.months.add(`${date.getFullYear()}-${date.getMonth() + 1}`);
    group.amount = Math.max(group.amount, amount);
    if (hasGenericBillSignal(text)) group.billSignalCount += 1;
    if (/direct debit|standing order|dd|so|monthly|subscription|contract|instalment|installment/.test(text)) group.mechanismSignalCount += 1;
  });

  return [...groups.values()]
    .filter((group) => {
      const repeated = group.months.size >= 2 && group.transactions.length >= 2;
      const signalled = group.billSignalCount > 0 || group.mechanismSignalCount > 0;
      return repeated && (signalled || group.amount >= 250);
    })
    .map((group) => {
      const text = normalizeText(group.matchText);
      const inferred = inferTransactionCategory(group.sampleDescription || group.matchText, -group.amount);
      const category = /mortgage/.test(text)
        ? "Mortgage"
        : /rent|landlord|letting/.test(text) || group.amount >= 500
        ? "Rent"
        : inferred.is_bill
        ? inferred.category
        : "Major bill";
      const confidence = group.billSignalCount > 0 || group.months.size >= 3 ? "medium" : "low";
      return {
        key: group.key,
        matchText: group.matchText,
        label: group.label || "Recurring payment",
        amount: Number(group.amount.toFixed(2)),
        count: group.transactions.length,
        monthCount: group.months.size,
        category,
        confidence,
        sampleDescription: group.transactions[0]?.description || group.label,
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);
}

export function inferRecurringPersonalBills(transactions) {
  const groups = new Map();

  transactions.forEach((transaction) => {
    const amount = Math.abs(Number(transaction.amount || 0));
    if (Number(transaction.amount) >= 0 || amount < 300) return;
    const text = normalizeText(transaction.description)
      .replace(/\b(faster payment|standing order|bank transfer|payment to|fpi|ref|reference|mobile payment)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return;
    const key = `${text}|${Math.round(amount / 10) * 10}`;
    if (!groups.has(key)) groups.set(key, { text, amount, transactions: [] });
    groups.get(key).transactions.push(transaction);
  });

  return [...groups.values()].filter((group) => {
    const months = new Set(group.transactions.map((transaction) => String(transaction.transaction_date || "").slice(0, 7)));
    return months.size >= 2 && (/miss|mrs|mr|ms|mstr|rent|landlord|mortgage|letting|property/.test(group.text) || group.amount >= 500);
  });
}

function hasGenericBillSignal(text) {
  return /\b(rent|mortgage|landlord|letting|council|tax|energy|electric|electricity|gas|water|utility|utilities|broadband|internet|wifi|phone|mobile|sim|contract|insurance|assurance|loan|finance|credit card|childcare|nursery|school fees|tv licence|licence|subscription|membership|direct debit|standing order|monthly|instalment|installment)\b/.test(text);
}

function isLikelyEverydaySpend(text) {
  return /\b(tesco|aldi|lidl|asda|sainsbury|morrisons|waitrose|greggs|mcdonald|kfc|burger king|subway|deliveroo|uber eats|just eat|amazon marketplace|ebay|vinted|coffee|cafe|pub|bar|restaurant|petrol|fuel|parking)\b/.test(text);
}

function toTitleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
