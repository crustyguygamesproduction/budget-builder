const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024;

const ALLOWED_SENSITIVE_FILE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif"]);

export function sanitizeStorageFileName(fileName) {
  const rawName = String(fileName || "upload").trim().toLowerCase();
  const cleanName = rawName
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 96);

  return cleanName || "upload";
}

export function validateSensitiveFile(file, options = {}) {
  if (!file) {
    return { ok: false, message: "Choose a file first." };
  }

  const maxBytes = options.maxBytes || DEFAULT_MAX_FILE_BYTES;
  const extension = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  const type = String(file.type || "").toLowerCase();
  const isAllowedType = ALLOWED_SENSITIVE_FILE_TYPES.has(type) || ALLOWED_EXTENSIONS.has(extension);

  if (!isAllowedType) {
    return {
      ok: false,
      message: "Use a PDF or image file. Bank and receipt documents should not be uploaded in other formats.",
    };
  }

  if (file.size > maxBytes) {
    return {
      ok: false,
      message: `Keep uploads under ${Math.round(maxBytes / 1024 / 1024)} MB.`,
    };
  }

  return { ok: true };
}

export function validateStatementCsvFile(file) {
  if (!file) {
    return { ok: false, message: "Choose a CSV statement first." };
  }

  const extension = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  const type = String(file.type || "").toLowerCase();
  const looksLikeCsv = extension === "csv" || type === "text/csv" || type === "application/vnd.ms-excel";

  if (!looksLikeCsv) {
    return { ok: false, message: "Only CSV statements can be imported here." };
  }

  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, message: "Keep CSV statement imports under 10 MB per file." };
  }

  return { ok: true };
}

export function buildPrivateStoragePath(userId, folder, fileName) {
  const safeName = sanitizeStorageFileName(fileName);
  const nonce = crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${userId}/${folder}/${nonce}-${safeName}`;
}

export async function openSignedStorageFile(supabase, bucket, filePath) {
  if (!filePath) return;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, 60);

  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
