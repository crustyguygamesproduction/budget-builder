const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { mode = "coach", message, context } = await req.json();
    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
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
- Default length is short.
- Default reply format is 4 short sections:
  Verdict:
  The read:
  The risk:
  Next move:
- Each section should be one sentence by default.
- Only go longer if the user explicitly asks for detail, a plan, a breakdown, or step-by-step help.

Money rules:
- Use only the supplied financial context.
- Never invent numbers.
- Always include the £ symbol when referring to money.
- Assume the user's currency is GBP.
- Prefer practical actions over abstract advice.
- Give easy, realistic next moves.
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
        error: String(error),
      }),
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

