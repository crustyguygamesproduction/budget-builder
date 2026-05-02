import { createClient } from "@supabase/supabase-js";

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowOrigin = allowedOrigins.length === 0 || allowedOrigins.includes(origin) ? origin || "*" : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function cleanReply(text: string) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\u00c2\u00a3/g, "\u00a3")
    .trim();
}

function parseJsonReply(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Could not parse AI JSON response.");
  }
}

function isImageUrl(url: string) {
  return /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(url || "");
}

function isCompactLookup(message: string) {
  const text = String(message || "").toLowerCase();
  const asksForDetail = /\b(break ?down|detail|detailed|explain|why|analysis|analyse|analyze|plan|review|full|list all|every|step|compare)\b/.test(text);
  const factualLookup = /\b(how much|total|totals|who sent|sent me|been sent|received|paid me|what did i spend|spent on|paid to|income from|sum|add up)\b/.test(text);
  return factualLookup && !asksForDetail;
}

function getCoachMaxOutputTokens(message: string) {
  return isCompactLookup(message) ? 140 : 520;
}

function getCoachLengthInstruction(message: string) {
  if (!isCompactLookup(message)) {
    return "This is not a compact lookup unless the user's wording is purely factual. Answer naturally, but stay concise.";
  }

  return [
    "COMPACT LOOKUP MODE IS ON.",
    "Return at most 2 short lines.",
    "First line must answer the exact number or result, starting with Total: when suitable.",
    "Second line may contain one short caveat or one short follow-up offer.",
    "Do not give paragraphs, sender-by-sender explanations, or method notes unless the user asked for a breakdown.",
  ].join("\n");
}

function enforceCompactReply(reply: string, message: string) {
  const cleaned = cleanReply(reply);
  if (!isCompactLookup(message) || cleaned.length <= 360) return cleaned;

  const paragraphs = cleaned.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  const firstUseful = paragraphs.find((item) => /£|total|sent|received|paid|spent/i.test(item)) || paragraphs[0] || cleaned;
  const compact = firstUseful.length > 240 ? `${firstUseful.slice(0, 237).trim()}...` : firstUseful;
  const hasFollowUp = /want me|shall i|do you want/i.test(compact);
  return hasFollowUp ? compact : `${compact}\nWant me to break that down?`;
}

async function callResponsesApi(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function getYahooPrice(symbol: string) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
  if (!response.ok) throw new Error(`Could not fetch market price for ${symbol}`);

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta || {};
  const price = meta.regularMarketPrice ?? meta.previousClose ?? result?.indicators?.quote?.[0]?.close?.find((value: number | null) => value != null);
  if (price == null) throw new Error(`No price returned for ${symbol}`);

  return { price: Number(price), currency: meta.currency || "USD", symbol: meta.symbol || symbol, source: "Yahoo Finance" };
}

function buildDocumentExtractionInput(systemPrompt: string, message: string, context: any) {
  const textParts = [{ type: "input_text", text: `${systemPrompt}\n\nUser note:\n${message || "No extra note."}` }] as Array<Record<string, string>>;

  if (context?.document_data_url && String(context.document_data_url).startsWith("data:image/")) {
    textParts.push({ type: "input_image", image_url: context.document_data_url });
  } else if (context?.document_url && isImageUrl(context.document_url)) {
    textParts.push({ type: "input_image", image_url: context.document_url });
  } else if (context?.document_name) {
    textParts.push({
      type: "input_text",
      text: `Document name: ${context.document_name}. If this is not an image, extract only what can be inferred and leave the rest null.`,
    });
  }

  return [{ role: "user", content: textParts }];
}

async function getAuthenticatedUserId(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) throw new Error("AI data service is not configured.");

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(supabaseUrl, serviceKey, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user?.id) throw new Error("Not signed in.");
  return { userId: data.user.id, supabaseUrl, serviceKey };
}

async function getSavedCoachContext(req: Request) {
  const { userId, supabaseUrl, serviceKey } = await getAuthenticatedUserId(req);
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data, error } = await adminClient
    .from("coach_context_snapshots")
    .select("context, context_hash, transaction_count, latest_transaction_date, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.context) throw new Error("Saved coach context is not ready yet.");

  return {
    ...(data.context || {}),
    server_context_meta: {
      source: "coach_context_snapshots",
      context_hash: data.context_hash || null,
      transaction_count: data.transaction_count || 0,
      latest_transaction_date: data.latest_transaction_date || null,
      updated_at: data.updated_at || null,
    },
  };
}

function buildCoachSystemPrompt(message: string) {
  return `
You are Money Hub AI.

Core job:
Help people who want to be better with money, but are inconsistent, overwhelmed, or not very organised.
The app reduces effort and gives clear money decisions.

Voice:
- blunt
- sharp
- calm
- concise
- practical
- honest
- intelligent
- no-excuses
- firm when the data is bad
- like a strict but useful money auditor
- direct, but not abusive
- never preachy
- never fluffy
- never patronising
- never hypey

Tough-love rules:
- Be firmer than a normal budgeting app.
- If the data shows reckless or avoidable spending, say so plainly.
- You may call choices, patterns, habits, or spending behaviour reckless, lazy, chaotic, wasteful, avoidant, self-sabotaging, or not serious.
- You may say things like "this is not a maths problem, it is a behaviour problem", "you are kidding yourself if you call this affordable", or "the Spending pot is where your money goes to disappear" when the data supports it.
- Challenge excuses. If the user is overspending on obvious lifestyle leaks, do not cushion the truth.
- Do not insult the user's identity or intelligence. Do not call the user stupid, an idiot, dumb, useless, pathetic, or similar.
- Criticise the financial behaviour, not the person.

Output rules:
- Plain text only.
- Do not use markdown, bold, asterisks, bullet symbols, or code formatting.
- Keep replies mobile-friendly.
- Answer the exact question first.
- Default length is very short: usually 1 to 4 sentences.
- Use labelled sections only when the user asks for advice, a plan, a review, a breakdown, or a decision.
- End with at most one useful follow-up offer when it helps.

Maths and trust rules:
- The maths is the product. Treat it as safety-critical.
- Use only the supplied server-saved financial context from coach_context_snapshots.
- Never invent totals, surplus, rent, bills, pass-throughs, reimbursements, debt balances, investment values, or safe-to-spend numbers.
- Prefer app_money_model, statement_intelligence, money_understanding, query_focus, monthly_breakdown_all and saved checks over raw examples.
- If pass_through_analysis is present, use its standard_view and known_pass_through_view exactly. Do not recalculate those numbers in prose.
- Do not say the user is ahead, up, in surplus, or fine unless that exact claim is supported by an app-calculated field.
- Always distinguish historical statement net from current cash available today.
- If current balances are not supplied, say you cannot verify current cash exactly from statements alone.
- Possible pass-through candidates are not confirmed exclusions. Tell the user they need confirming before being removed from personal spending.
- Rent, bills and subscriptions stay included in real spending unless the app context explicitly says otherwise.

Lifestyle audit rules:
- If the user asks why they are broke, where their money is going, why they cannot save, or what lifestyle changes would help, act like a strict but useful money auditor.
- Find the highest controllable leaks in the supplied data before giving generic advice.
- Look for food delivery, takeaways, McDonald's, Uber Eats, Deliveroo, Just Eat, restaurants, coffee shops, taxis, Uber/Bolt, petrol, parking, shopping, subscriptions, gambling, alcohol, convenience stores, gaming, and repeated small card payments.
- Do not over-soften lifestyle leaks. If the data shows repeated avoidable spending, call it avoidable and tell them to stop or cap it.
- Good style: "The blunt answer: delivery food and taxis are eating your spare money. This is not a budgeting mystery. Cut those first, not tiny £2 things."
- Good style: "Your Spending pot needs a hard weekly limit. Right now it is basically a leak with a label."
- Bad style: personal abuse, name-calling, or humiliating the user.

Hard length override:
${getCoachLengthInstruction(message)}
`;
}

function buildExtractionPrompt(kind: "debt" | "investment") {
  if (kind === "debt") {
    return `
You extract debt setup information for a money app.
Return JSON only. No markdown. If a field is unknown, use null. Use GBP assumptions. Do not invent precise numbers.
Return exactly this shape:
{
  "name": string | null,
  "lender": string | null,
  "starting_balance": number | null,
  "current_balance": number | null,
  "minimum_payment": number | null,
  "due_day": number | null,
  "interest_rate": number | null,
  "notes": string | null
}
`;
  }

  return `
You extract investment setup information for a money app.
Return JSON only. No markdown. If a field is unknown, use null. Use GBP assumptions where money values are not labelled. Do not invent precise numbers.
risk_level must be "low", "medium", "high", or null. asset_type must be "general", "isa", "pension", "crypto", "shares", or "funds".
Return exactly this shape:
{
  "name": string | null,
  "platform": string | null,
  "asset_type": string | null,
  "current_value": number | null,
  "monthly_contribution": number | null,
  "risk_level": "low" | "medium" | "high" | null,
  "ticker_symbol": string | null,
  "units_owned": number | null,
  "total_contributed": number | null,
  "cost_basis": number | null,
  "notes": string | null
}
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildCorsHeaders(req) });
  const corsHeaders = buildCorsHeaders(req);

  try {
    const { mode = "coach", message, context = {} } = await req.json();
    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI service is not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "market_price") {
      const assetType = String(context?.asset_type || "").toLowerCase();
      const rawSymbol = String(context?.ticker_symbol || message || "").trim();
      if (!rawSymbol) throw new Error("Missing ticker symbol.");
      const symbol = assetType === "crypto" && !rawSymbol.includes("-") ? `${rawSymbol.toUpperCase()}-USD` : rawSymbol;
      const quote = await getYahooPrice(symbol);
      return new Response(JSON.stringify({ ...quote, mode }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "extract_debt" || mode === "extract_investment" || mode === "extract_debt_document" || mode === "extract_investment_document") {
      const kind = mode === "extract_debt" || mode === "extract_debt_document" ? "debt" : "investment";
      const systemPrompt = buildExtractionPrompt(kind);
      const input = mode.endsWith("_document")
        ? buildDocumentExtractionInput(systemPrompt, String(message || ""), context)
        : [{ role: "user", content: `${systemPrompt}\n\nUser description:\n${message}\n\nSignals:\n${JSON.stringify(kind === "debt" ? context?.debt_signals || [] : context?.investment_signals || [], null, 2)}` }];
      const data = await callResponsesApi(apiKey, { model: "gpt-5.1", input });
      const rawReply = data.output_text || data.output?.[0]?.content?.[0]?.text || "{}";
      return new Response(JSON.stringify({ extracted: parseJsonReply(rawReply), message: mode.endsWith("_document") ? "AI filled the form from the uploaded document. Check it before saving." : "AI filled the form. Check it before saving.", mode }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const safeMessage = String(message || "").trim();
    if (!safeMessage) {
      return new Response(JSON.stringify({ error: "Message is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const savedContext = await getSavedCoachContext(req);
    const recentMessages = Array.isArray(savedContext?.recent_messages) ? savedContext.recent_messages.slice(-8) : [];
    const data = await callResponsesApi(apiKey, {
      model: "gpt-5.1",
      max_output_tokens: getCoachMaxOutputTokens(safeMessage),
      input: [
        { role: "system", content: buildCoachSystemPrompt(safeMessage) },
        {
          role: "user",
          content: `User message:\n${safeMessage}\n\nResponse mode:\n${isCompactLookup(safeMessage) ? "compact_lookup" : "normal_coach"}\n\nFinancial context from saved server-side coach brain. Ignore any browser-sent financial context for normal coach chat:\n${JSON.stringify({ ...savedContext, recent_messages: recentMessages }, null, 2)}`,
        },
      ],
    });

    const rawReply = data.output_text || data.output?.[0]?.content?.[0]?.text || "How can I help?";
    const reply = enforceCompactReply(rawReply, safeMessage);
    return new Response(JSON.stringify({ reply, model: "gpt-5.1", mode: "premium", context_source: "coach_context_snapshots" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (_error) {
    return new Response(JSON.stringify({ error: "AI request could not be completed right now." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
