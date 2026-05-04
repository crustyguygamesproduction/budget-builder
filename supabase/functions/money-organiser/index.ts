import { createClient } from "@supabase/supabase-js";
import {
  AiUsageError,
  byteLength,
  enforceAiUsage,
  readJsonBody,
} from "../_shared/aiUsage.ts";
import { buildTransactionIntelligence } from "../_shared/moneyOrganiserIntelligence.js";

function isProductionRuntime() {
  const env = String(Deno.env.get("ENVIRONMENT") || Deno.env.get("DENO_ENV") || Deno.env.get("APP_ENV") || "").toLowerCase();
  return ["production", "prod"].includes(env);
}

function isLocalOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(origin);
}

function isProjectVercelOrigin(origin: string) {
  return /^https:\/\/budget-builder-[a-z0-9-]+-crustyguygamesproductions-projects\.vercel\.app$/i.test(origin);
}

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((item) => item.trim()).filter(Boolean);

  if (allowedOrigins.length === 0 && isProductionRuntime()) {
    console.error("money-organiser: ALLOWED_ORIGINS must be set in production");
    return {
      "Access-Control-Allow-Origin": "null",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "X-CORS-Config-Error": "missing_allowed_origins",
    };
  }

  const allowOrigin = allowedOrigins.includes(origin) || isProjectVercelOrigin(origin)
    ? origin
    : allowedOrigins.length > 0
      ? allowedOrigins[0]
      : isLocalOrigin(origin)
        ? origin
        : "null";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function hasCorsConfigError(headers: Record<string, string>) {
  return headers["X-CORS-Config-Error"] === "missing_allowed_origins";
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
  const maxOutputTokens = Number(Deno.env.get("MONEY_ORGANISER_MAX_OUTPUT_TOKENS") || 3000);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.1",
      max_output_tokens: Math.max(1200, Math.min(maxOutputTokens, 5000)),
      input,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data.output_text || data.output?.[0]?.content?.[0]?.text || "{}";
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (hasCorsConfigError(corsHeaders)) {
    return new Response(JSON.stringify({ error: "ALLOWED_ORIGINS must be set in production." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { body: requestBody, bytes: requestBytes } = await readJsonBody(req, 10_000);
    const { force = false } = requestBody;
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
    const maxRows = Number(Deno.env.get("MONEY_ORGANISER_MAX_ROWS") || 3000);
    if (rows.length > maxRows) {
      throw new AiUsageError(
        "too_many_transactions",
        `That is a lot of history to organise at once. Money Hub can organise up to ${maxRows} rows per AI pass right now.`,
        413,
        `money-organiser row cap exceeded: ${rows.length}/${maxRows}`
      );
    }
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

    const transactionIntelligence = buildTransactionIntelligence(rows);

    await enforceAiUsage(req, {
      functionName: "money-organiser",
      action: force ? "organise_force_clustered" : "organise_clustered",
      inputBytes: requestBytes + byteLength(transactionIntelligence),
      limits: [
        { windowSeconds: 3600, maxRequests: 5 },
        { windowSeconds: 86400, maxRequests: 20 },
      ],
    });

    const systemPrompt = `
You are the Money Hub statement organiser.
You convert pre-clustered bank transaction intelligence into a saved app data layer.
Return JSON only. No markdown. No prose outside JSON.

You are NOT receiving every raw transaction. You are receiving deterministic groups, top totals, large samples, representative rows, rare annual candidates, split-payment candidates, and source transaction IDs.
Use source_transaction_ids from the supplied groups/samples. Do not invent source IDs.

The app is for everyday people who are bad with money. Be conservative and useful.
Future bills must only include fixed commitments: rent, mortgage, council tax, energy, water, broadband, phone, insurance, debt/credit/finance, childcare, subscriptions.
Never put takeaway, restaurants, groceries, shopping, gaming, cash withdrawals, investments, internal transfers, work pass-through or random spending into future bills.

Use real-world judgement:
- Same provider can have multiple bill streams, split by usual amount and timing. Example: EE phone and EE broadband are separate if amounts/dates differ.
- Review annual_or_rare_commitment_candidates for yearly insurance, licence, tax and other rare fixed commitments.
- Review split_payment_candidates for split rent, mortgage, finance or childcare payments within the same month.
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
Organise this deterministic transaction intelligence into the app layer.
Prefer recurring_candidates for future monthly bills, but also check annual_or_rare_commitment_candidates, split_payment_candidates, suspicious_or_high_impact_groups and large_outgoing_samples.
Only use representative_raw_sample for examples and transaction-level corrections.
Transaction intelligence:
${JSON.stringify(transactionIntelligence, null, 2)}
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
    const ai_context = {
      ...(organised.ai_context || {}),
      transaction_intelligence_summary: {
        total_rows: transactionIntelligence.total_rows,
        recurring_candidate_count: transactionIntelligence.recurring_candidates.length,
        rare_commitment_candidate_count: transactionIntelligence.annual_or_rare_commitment_candidates.length,
        split_payment_candidate_count: transactionIntelligence.split_payment_candidates.length,
        suspicious_group_count: transactionIntelligence.suspicious_or_high_impact_groups.length,
      },
    };
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
    const status = error instanceof AiUsageError ? error.status : 500;
    const publicMessage = error instanceof AiUsageError
      ? error.publicMessage
      : "Money organiser could not finish that read right now.";
    console.error("money-organiser request failed", {
      code: error instanceof AiUsageError ? error.code : "money_organiser_failed",
      message: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ error: publicMessage, code: error instanceof AiUsageError ? error.code : "money_organiser_failed" }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
