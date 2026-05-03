import {
  AiUsageError,
  assertArrayLimit,
  byteLength,
  enforceAiUsage,
  readJsonBody,
} from "../_shared/aiUsage.ts";

function isProductionRuntime() {
  const env = String(Deno.env.get("ENVIRONMENT") || Deno.env.get("DENO_ENV") || Deno.env.get("APP_ENV") || "").toLowerCase();
  return ["production", "prod"].includes(env);
}

function isLocalOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(origin);
}

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0 && isProductionRuntime()) {
    console.error("swift-worker: ALLOWED_ORIGINS must be set in production");
    return {
      "Access-Control-Allow-Origin": "null",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "X-CORS-Config-Error": "missing_allowed_origins",
    };
  }

  const allowOrigin = allowedOrigins.includes(origin)
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

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (hasCorsConfigError(corsHeaders)) {
    return new Response(JSON.stringify({ error: "ALLOWED_ORIGINS must be set in production." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { body, bytes: requestBytes } = await readJsonBody(req, 80_000);
    const { headers, sampleRows = [] } = body;
    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!headers || !Array.isArray(headers)) {
      return new Response(JSON.stringify({ error: "Missing CSV headers" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    assertArrayLimit(headers, 80, "columns");
    assertArrayLimit(sampleRows, 10, "sample rows");
    if (byteLength({ headers, sampleRows }) > 60_000) {
      throw new AiUsageError("payload_too_large", "That CSV preview is too large to map in one AI read.", 413);
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI service is not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await enforceAiUsage(req, {
      functionName: "swift-worker",
      action: "csv_mapping",
      inputBytes: requestBytes,
      limits: [
        { windowSeconds: 3600, maxRequests: 20 },
        { windowSeconds: 86400, maxRequests: 80 },
      ],
    });

    const prompt = `
You are mapping bank statement CSV columns for a finance app.

Return ONLY valid JSON. No text, no explanation.

Format exactly like this:
{
  "date": "column_name_or_null",
  "description": "column_name_or_null",
  "payee": "column_name_or_null",
  "reference": "column_name_or_null",
  "amount": "column_name_or_null",
  "money_in": "column_name_or_null",
  "money_out": "column_name_or_null"
}

Rules:
- If there is one signed amount column, use "amount"
- If there are separate columns, use "money_in" and "money_out"
- If there are columns naming the person, shop, recipient, sender, beneficiary, or counterparty, use "payee"
- If there is a payment reference, memo, note, narrative, or extra detail column, use "reference"
- Use null if missing
- Use exact header names from the CSV headers provided

Headers:
${JSON.stringify(headers)}

Sample rows:
${JSON.stringify(sampleRows)}
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: prompt,
        temperature: 0,
        text: { format: { type: "json_object" } },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error?.message || "OpenAI CSV mapping request failed");
    }

    const text =
      result.output_text ||
      (result.output &&
        result.output[0] &&
        result.output[0].content &&
        result.output[0].content[0] &&
        result.output[0].content[0].text) ||
      "{}";

    return new Response(text, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("swift-worker request failed", {
      code: error instanceof AiUsageError ? error.code : "swift_worker_failed",
      message: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({
      error: error instanceof AiUsageError ? error.publicMessage : "CSV mapping is unavailable right now.",
      code: error instanceof AiUsageError ? error.code : "swift_worker_failed",
    }), {
      status: error instanceof AiUsageError ? error.status : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
