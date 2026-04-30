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

export async function prepareSensitiveUploadFile(file, options = {}) {
  if (!file || !String(file.type || "").startsWith("image/")) return file;

  const maxDimension = options.maxDimension || 1600;
  const quality = options.quality || 0.72;
  const targetType = options.type || "image/webp";

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, targetType, quality));
    if (!blob || blob.size >= file.size) return file;

    const baseName = sanitizeStorageFileName(file.name).replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName || "upload"}.webp`, {
      type: targetType,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

export async function openSignedStorageFile(supabase, bucket, filePath) {
  if (!filePath) return;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, 60);

  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export async function getSignedStorageUrl(supabase, bucket, filePath, expiresIn = 300) {
  if (!filePath) return "";

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, expiresIn);

  if (error) throw error;
  return data.signedUrl;
}
