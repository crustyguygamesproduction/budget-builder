export async function getFunctionErrorMessage(error, fallback = "That AI request could not be completed right now.") {
  if (!error) return fallback;

  const response = error.context;
  if (response && typeof response.json === "function") {
    try {
      const body = await response.clone().json();
      if (body?.error) return body.error;
    } catch {
      // Fall back to the message below.
    }
  }

  const message = String(error.message || "");
  if (/non-2xx status code/i.test(message)) return fallback;
  return message || fallback;
}
