import { createClient } from "@supabase/supabase-js";

export class AiUsageError extends Error {
  status: number;
  code: string;
  publicMessage: string;

  constructor(code: string, publicMessage: string, status = 400, logMessage = publicMessage) {
    super(logMessage);
    this.name = "AiUsageError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

type UsageLimit = {
  windowSeconds: number;
  maxRequests: number;
};

type UsageOptions = {
  functionName: string;
  action: string;
  inputBytes?: number;
  limits?: UsageLimit[];
};

export async function readJsonBody(req: Request, maxBytes: number) {
  const text = await req.text();
  const bytes = byteLength(text);
  if (bytes > maxBytes) {
    throw new AiUsageError(
      "payload_too_large",
      "That is too much for Money Hub to read in one go. Try a smaller upload or shorter message.",
      413,
      `Payload ${bytes} bytes exceeded ${maxBytes} bytes`
    );
  }

  try {
    return { body: text ? JSON.parse(text) : {}, bytes };
  } catch {
    throw new AiUsageError("bad_json", "Money Hub could not read that request.", 400);
  }
}

export function byteLength(value: unknown) {
  return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value ?? "")).length;
}

export function assertTextLimit(value: unknown, maxChars: number, label = "text") {
  if (String(value || "").length > maxChars) {
    throw new AiUsageError(
      "input_too_long",
      `That ${label} is too long for one AI read. Shorten it and try again.`,
      413
    );
  }
}

export function assertArrayLimit(items: unknown, maxItems: number, label = "items") {
  if (Array.isArray(items) && items.length > maxItems) {
    throw new AiUsageError(
      "too_many_items",
      `That has too many ${label} for one AI read. Try a smaller file or fewer rows.`,
      413
    );
  }
}

export async function enforceAiUsage(req: Request, options: UsageOptions) {
  const { userId, adminClient } = await getAiUsageAuth(req);
  const limits = options.limits?.length ? options.limits : [{ windowSeconds: 3600, maxRequests: 30 }];

  for (const limit of limits) {
    const since = new Date(Date.now() - limit.windowSeconds * 1000).toISOString();
    const { count, error } = await adminClient
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("function_name", options.functionName)
      .eq("action", options.action)
      .gte("created_at", since);

    if (error) throw error;
    if ((count || 0) >= limit.maxRequests) {
      throw new AiUsageError(
        "rate_limited",
        "AI is taking a breather for this account. Try again later.",
        429,
        `${options.functionName}:${options.action} exceeded ${limit.maxRequests}/${limit.windowSeconds}s`
      );
    }
  }

  const { error: insertError } = await adminClient.from("ai_usage_events").insert({
    user_id: userId,
    function_name: options.functionName,
    action: options.action,
    input_bytes: Math.max(0, Math.round(options.inputBytes || 0)),
    unit_count: 1,
  });
  if (insertError) throw insertError;

  return { userId };
}

async function getAiUsageAuth(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new AiUsageError("missing_usage_env", "AI usage controls are not configured.", 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new AiUsageError("not_signed_in", "Please sign in again before using AI.", 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data, error } = await adminClient.auth.getUser(jwt);
  if (error || !data?.user?.id) {
    throw new AiUsageError("not_signed_in", "Please sign in again before using AI.", 401, error?.message || "JWT validation failed");
  }

  return { userId: data.user.id, adminClient };
}
