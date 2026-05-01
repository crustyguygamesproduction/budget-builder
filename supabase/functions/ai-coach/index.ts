function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowOrigin = allowedOrigins.length === 0 || allowedOrigins.includes(origin) ? origin || "*" : allowedOrigins[0];

  return {
  "Access-Control-Allow-Origin": allowOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("Could not parse AI JSON response.");
  }
}

function isImageUrl(url: string) {
  return /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(url || "");
}

async function callResponsesApi(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data;
}

async function getYahooPrice(symbol: string) {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  );

  if (!response.ok) {
    throw new Error(`Could not fetch market price for ${symbol}`);
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta || {};
  const price =
    meta.regularMarketPrice ??
    meta.previousClose ??
    result?.indicators?.quote?.[0]?.close?.find((value: number | null) => value != null);

  if (price == null) {
    throw new Error(`No price returned for ${symbol}`);
  }

  return {
    price: Number(price),
    currency: meta.currency || "USD",
    symbol: meta.symbol || symbol,
    source: "Yahoo Finance",
  };
}

function buildDocumentExtractionInput(systemPrompt: string, message: string, context: any) {
  const textParts = [
    { type: "input_text", text: `${systemPrompt}

User note:
${message || "No extra note."}` },
  ] as Array<Record<string, string>>;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildCorsHeaders(req) });
  }
  const corsHeaders = buildCorsHeaders(req);

  try {
    const { mode = "coach", message, context } = await req.json();
    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
          return new Response(JSON.stringify({ error: "AI service is not configured." }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const recentMessages = Array.isArray(context?.recent_messages)
      ? context.recent_messages.slice(-8)
      : [];

    if (mode === "market_price") {
      const assetType = String(context?.asset_type || "").toLowerCase();
      const rawSymbol = String(context?.ticker_symbol || message || "").trim();
      if (!rawSymbol) {
        throw new Error("Missing ticker symbol.");
      }

      const symbol = assetType === "crypto" && !rawSymbol.includes("-")
        ? `${rawSymbol.toUpperCase()}-USD`
        : rawSymbol;
      const quote = await getYahooPrice(symbol);

      return new Response(
        JSON.stringify({
          ...quote,
          mode,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let systemPrompt = "";
    let userPrompt = "";
    let responseBody: Record<string, unknown> | null = null;

    if (mode === "extract_debt" || mode === "extract_debt_document") {
      systemPrompt = `
You extract debt setup information for a money app.

Rules:
- Return JSON only.
- No markdown.
- No explanation outside JSON.
- If a field is unknown, use null.
- If there is not enough to infer a clean debt name, still try a sensible short label.
- Use GBP assumptions.
- Do not invent precise numbers if none were given.
- Keep notes short.

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

      if (mode === "extract_debt_document") {
        responseBody = {
          model: "gpt-5.1",
          input: buildDocumentExtractionInput(systemPrompt, message, context),
        };
      } else {
        userPrompt = `
User debt description:
${message}

Possible statement-based debt signals:
${JSON.stringify(context?.debt_signals || [], null, 2)}
`;
      }
    } else if (mode === "extract_investment" || mode === "extract_investment_document") {
      systemPrompt = `
You extract investment setup information for a money app.

Rules:
- Return JSON only.
- No markdown.
- No explanation outside JSON.
- If a field is unknown, use null.
- Use GBP assumptions where money values are not labelled.
- Do not invent precise numbers if none were given.
- Keep notes short.
- Infer a sensible risk_level when possible from the wording, platform, or asset type.
- risk_level should be one of:
  "low", "medium", "high", or null
- asset_type should be one of:
  "general", "isa", "pension", "crypto", "shares", "funds"

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

      if (mode === "extract_investment_document") {
        responseBody = {
          model: "gpt-5.1",
          input: buildDocumentExtractionInput(systemPrompt, message, context),
        };
      } else {
        userPrompt = `
User investment description:
${message}

Possible statement-based investment signals:
${JSON.stringify(context?.investment_signals || [], null, 2)}
`;
      }
    } else {
      systemPrompt = `
You are Money Hub AI.

Core job:
Help people who want to be better with money, but are inconsistent, overwhelmed, or not very organised.
This app is supposed to reduce effort, not create more admin.

Voice:
- sharp
- calm
- concise
- practical
- honest
- intelligent
- direct, but not rude
- lightly like a good money auditor
- never preachy
- never fluffy
- never patronising
- never hypey

Output rules:
- Plain text only.
- Do not use markdown.
- Do not use bold, asterisks, bullet symbols like * or -, or code formatting.
- Keep replies mobile-friendly.
- Answer the exact question first.
- Default length is very short: usually 1 to 4 sentences.
- Do not use the Verdict / The read / The risk / Next move format for simple questions.
- Only use labelled sections when the user asks for advice, a plan, a review, a breakdown, or a decision.
- Do not explain how you calculated something unless the user asks, or unless the answer would otherwise be unclear.
- End with at most one useful follow-up offer when it helps. Keep it short, for example: "Want me to break that down by person?"
- Do not add a follow-up offer if the answer is already complete and obvious.

Answer sizing rules:
- If the user asks "how much", "total", "who sent", "what did I spend", or another factual lookup, give the number first and keep it compact.
- For total questions, use this shape when possible: "Total: £X." Then add one short sentence of context if useful.
- For grouped totals, show only the top few groups unless the user asks for all of them.
- If the user asks for a breakdown, comparison, plan, or decision, give more structure, but still keep it concise.
- If the user asks something broad like "how am I doing?", use short sections: Quick read, Why, Next move.
- If the user asks a yes/no spending question, answer yes/no/close first, then the reason.

Examples:
User: "How much total have I been sent by friends and family?"
Good answer: "Total: £1,240 from transactions that look like friends or family payments. Want me to break that down by person?"
Bad answer: four paragraphs explaining every sender unless asked.

User: "Who sent me the most?"
Good answer: "Sarah sent the most: £420. Next were Ben at £180 and Mum at £150. Want the full list?"

User: "Can I afford a £60 meal tonight?"
Good answer: "Probably, but only if no extra bills land before payday. Your safer move is to cap tonight at about £35 and keep the rest protected."

Money rules:
- Use only the supplied financial context.
- Never invent numbers.
- Always include the £ symbol when referring to money.
- Assume the user's currency is GBP.
- Prefer practical actions over abstract advice.
- Give easy, realistic next moves.

Statement intelligence rules:
- The client may provide statement_intelligence, searchable_transactions, and monthly_breakdown_all.
- statement_intelligence summaries are built from the full uploaded statement history.
- searchable_transactions is the transaction-level ledger the model can inspect directly. If it is capped, use the supplied note and say when more source rows may be needed.
- query_focus is built from the user's exact message against the full uploaded statement history. For questions like "how much did I send Ben?", use query_focus first because it can include older/smaller direct matches that are not in recent_transactions.
- When the user asks about a merchant, category, income stream, subscription, debt, investment, account, transfer, or pattern, first use the relevant all-history summary, then inspect searchable_transactions for examples.
- For people/payee questions, use query_focus.direct_matches and query_focus.grouped_matches for the total. If query_focus has only partial direct matches, say that the app can only count transactions where the statement text contains that name/reference; do not pretend unlabelled transfers belong to that person.
- Distinguish real spending/income from internal transfers whenever that flag is provided.
- Do not treat broker deposits as current investment value. They are cash flows unless an investment record or document provides a value.
`;

      userPrompt = `
User message:
${message}

Financial context:
${JSON.stringify(
  {
    totals: context?.totals || {},
    transaction_count: context?.transaction_count || 0,
    recent_transactions: context?.recent_transactions || [],
    searchable_transaction_note: context?.searchable_transaction_note || null,
    searchable_transaction_count: context?.searchable_transaction_count || 0,
    searchable_transactions: context?.searchable_transactions || [],
    query_focus: context?.query_focus || null,
    statement_intelligence: context?.statement_intelligence || null,
    top_categories: context?.top_categories || [],
    subscription_summary: context?.subscription_summary || null,
    debts: context?.debts || [],
    investments: context?.investments || [],
    debt_signals: context?.debt_signals || [],
    investment_signals: context?.investment_signals || [],
    calendar_mode: context?.calendar_mode || null,
    timeframe: context?.timeframe || null,
    timeframe_label: context?.timeframe_label || null,
    visible_window_label: context?.visible_window_label || null,
    calendar_summary: context?.calendar_summary || null,
    data_freshness: context?.data_freshness || null,
    monthly_breakdown: context?.monthly_breakdown || [],
    monthly_breakdown_all: context?.monthly_breakdown_all || [],
    visible_transactions: context?.visible_transactions || [],
    visible_transaction_count: context?.visible_transaction_count || 0,
    selected_day: context?.selected_day || null,
    recent_messages: recentMessages,
  },
  null,
  2
)}
`;
    }

    if (!responseBody) {
      responseBody = {
        model: "gpt-5.1",
        input: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      };
    }

    const data = await callResponsesApi(apiKey, responseBody);
    const rawReply =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      (mode === "coach" ? "How can I help?" : "{}");

    if (
      mode === "extract_debt" ||
      mode === "extract_investment" ||
      mode === "extract_debt_document" ||
      mode === "extract_investment_document"
    ) {
      const extracted = parseJsonReply(rawReply);

      return new Response(
        JSON.stringify({
          extracted,
          message:
            mode === "extract_debt_document" || mode === "extract_investment_document"
              ? "AI filled the form from the uploaded document. Check it before saving."
              : "AI filled the form. Check it before saving.",
          mode,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const reply = cleanReply(rawReply);

    return new Response(
      JSON.stringify({
        reply,
        model: "gpt-5.1",
        mode: "premium",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "AI request could not be completed right now." }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
