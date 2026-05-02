import { createClient } from "@supabase/supabase-js";

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((item) => item.trim()).filter(Boolean);
  const allowOrigin = allowedOrigins.length === 0 || allowedOrigins.includes(origin) ? origin || "*" : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function parseJsonReply(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("AI did not return valid JSON.");
  }
}

function normaliseTransaction(row: any) {
  return {
    id: row.id,
    date: row.transaction_date,
    description: row.description,
    merchant: row.merchant || row.description,
    amount: Number(row.amount || 0),
    direction: row.direction,
    category: row.category,
    is_bill: Boolean(row.is_bill),
    is_subscription: Boolean(row.is_subscription),
    is_internal_transfer: Boolean(row.is_internal_transfer),
    is_income: Boolean(row.is_income),
  };
}

async function callOpenAI(apiKey: string, input: unknown[]) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.1",
      max_output_tokens: 5000,
      input,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data.output_text || data.output?.[0]?.content?.[0]?.text || "{}";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildCorsHeaders(req) });
  const corsHeaders = buildCorsHeaders(req);

  try {
    const { force = false } = await req.json().catch(() => ({}));
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!apiKey || !supabaseUrl || !serviceKey) throw new Error("Money organiser is not configured.");

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, serviceKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user?.id) throw new Error("Not signed in.");
    const userId = userData.user.id;

    const { data: transactions, error: txError } = await adminClient
      .from("transactions")
      .select("id, transaction_date, description, merchant, amount, direction, category, is_bill, is_subscription, is_internal_transfer, is_income")
      .eq("user_id", userId)
      .order("transaction_date", { ascending: true });
    if (txError) throw txError;

    const rows = (transactions || []).map(normaliseTransaction);
    const sourceHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(rows.map((row) => [row.id, row.date, row.description, row.amount, row.category, row.is_bill, row.is_subscription, row.is_internal_transfer]))));
    const source_hash = Array.from(new Uint8Array(sourceHash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");

    if (!force) {
      const { data: existing } = await adminClient
        .from("money_understanding_snapshots")
        .select("id, interpreted_at, summary, bill_streams, recurring_events, checks")
        .eq("user_id", userId)
        .eq("source_hash", source_hash)
        .eq("model_version", "money-organiser-ai-v1")
        .maybeSingle();
      if (existing) return new Response(JSON.stringify({ snapshot: existing, reused: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const systemPrompt = `
You are the Money Hub statement organiser.
You convert messy bank transactions into a saved app data layer.
Return JSON only. No markdown. No prose outside JSON.

The app is for everyday people who are bad with money. Be conservative and useful.
Future bills must only include fixed commitments: rent, mortgage, council tax, energy, water, broadband, phone, insurance, debt/credit/finance, childcare, subscriptions.
Never put takeaway, restaurants, groceries, shopping, gaming, cash withdrawals, investments, internal transfers, work pass-through or random spending into future bills.

Use real-world judgement:
- Same provider can have multiple bill streams, split by usual amount and timing. Example: EE phone and EE broadband are separate if amounts/dates differ.
- If provider type is unclear, name safely: "EE bill around £16" rather than guessing phone/broadband.
- Rent may be split into early/partial payments. Use the usual monthly rent total from prior months, not one partial payment.
- If latest amount is an outlier due to discount/credit, use the usual amount and note the outlier.
- Energy bills like E.ON can vary. Still include as a best-guess bill if clearly energy.
- If unsure, create a check instead of silently guessing.
- Historical cashflow is not current balance.

Return exactly this shape:
{
  "summary": {
    "plainEnglish": string,
    "billsFound": number,
    "upcomingBillsTotal": number,
    "includesRent": boolean,
    "warnings": string[]
  },
  "bill_streams": [
    {
      "key": string,
      "name": string,
      "counterparty": string | null,
      "usual_amount": number,
      "usual_day": number | null,
      "kind": "rent" | "mortgage" | "council_tax" | "energy" | "water" | "broadband" | "phone" | "insurance" | "debt" | "childcare" | "subscription" | "other_bill",
      "confidence": "high" | "medium" | "needs_check",
      "evidence": string,
      "source_transaction_ids": string[]
    }
  ],
  "recurring_events": [
    {
      "key": string,
      "title": string,
      "amount": number,
      "day": number,
      "kind": "bill" | "subscription",
      "kindLabel": "Bill" | "Subscription",
      "confidenceLabel": "high" | "medium" | "estimated",
      "estimateNote": string,
      "sourceCount": number,
      "sourceMonths": number
    }
  ],
  "checks": [
    {
      "key": string,
      "question": string,
      "helper": string,
      "amount": number | null,
      "examples": string[],
      "source_transaction_ids": string[]
    }
  ],
  "transactions": [
    {
      "id": string,
      "real_merchant_name": string,
      "category": string,
      "is_bill": boolean,
      "is_subscription": boolean,
      "is_internal_transfer": boolean,
      "confidence": "high" | "medium" | "low"
    }
  ],
  "ai_context": {
    "bills_found": any[],
    "checks_waiting": any[],
    "notes": string[]
  }
}
`;

    const userPrompt = `
Organise these transactions into the app layer.
Use all rows, but keep source_transaction_ids compact.
Transactions:
${JSON.stringify(rows, null, 2)}
`;

    const raw = await callOpenAI(apiKey, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    const organised = parseJsonReply(raw);

    const summary = organised.summary || {};
    const bill_streams = Array.isArray(organised.bill_streams) ? organised.bill_streams : [];
    const recurring_events = Array.isArray(organised.recurring_events) ? organised.recurring_events : [];
    const checks = Array.isArray(organised.checks) ? organised.checks : [];
    const interpretedTransactions = Array.isArray(organised.transactions) ? organised.transactions : [];
    const ai_context = organised.ai_context || {};
    const latestDate = rows.map((row) => row.date).filter(Boolean).sort().at(-1) || null;

    const { data: snapshot, error: upsertError } = await adminClient
      .from("money_understanding_snapshots")
      .upsert({
        user_id: userId,
        source_hash,
        model_version: "money-organiser-ai-v1",
        interpreted_at: new Date().toISOString(),
        transaction_count: rows.length,
        latest_transaction_date: latestDate,
        summary,
        transactions: interpretedTransactions,
        bill_streams,
        recurring_events,
        checks,
        ai_context,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,source_hash,model_version" })
      .select()
      .single();
    if (upsertError) throw upsertError;

    return new Response(JSON.stringify({ snapshot, reused: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || "Money organiser failed." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
