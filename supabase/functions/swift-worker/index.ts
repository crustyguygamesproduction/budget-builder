const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { headers, sampleRows } = await req.json();
    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!headers || !Array.isArray(headers)) {
      return new Response(JSON.stringify({ error: "Missing CSV headers" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    console.error("SWIFT WORKER ERROR:", error);

    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
