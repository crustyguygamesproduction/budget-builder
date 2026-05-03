const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024;
const DEFAULT_SNIFF_BYTES = 4096;

const ALLOWED_SENSITIVE_FILE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif"]);

const SENSITIVE_MAGIC_BYTES = {
  pdf: [[0x25, 0x50, 0x44, 0x46]],
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
  png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  webp: [[0x52, 0x49, 0x46, 0x46]],
  heic: [[0x00, 0x00, 0x00]],
  heif: [[0x00, 0x00, 0x00]],
};

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
  const extension = getFileExtension(file);
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

export async function validateSensitiveFileContent(file, options = {}) {
  const baseValidation = validateSensitiveFile(file, options);
  if (!baseValidation.ok) return baseValidation;

  const extension = getFileExtension(file);
  const bytes = await readFileHead(file, options.sniffBytes || DEFAULT_SNIFF_BYTES);

  if (!bytes.length) {
    return { ok: false, message: "That file looks empty. Choose a PDF or image file." };
  }

  if (!matchesSensitiveMagicBytes(bytes, extension)) {
    return {
      ok: false,
      message: "That file content does not look like a real PDF or supported image. Please export the document again and retry.",
    };
  }

  return { ok: true };
}

export function validateStatementCsvFile(file) {
  if (!file) {
    return { ok: false, message: "Choose a CSV statement first." };
  }

  const extension = getFileExtension(file);
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

export async function validateStatementCsvFileContent(file, options = {}) {
  const baseValidation = validateStatementCsvFile(file);
  if (!baseValidation.ok) return baseValidation;

  const bytes = await readFileHead(file, options.sniffBytes || DEFAULT_SNIFF_BYTES);

  if (!bytes.length) {
    return { ok: false, message: "That CSV file looks empty." };
  }

  if (hasBinarySignature(bytes) || !looksLikeTextBytes(bytes)) {
    return {
      ok: false,
      message: "That file does not look like a text CSV. Export the statement as CSV and try again.",
    };
  }

  const preview = decodeTextPreview(bytes);
  if (!/[,;\t]/.test(preview) || !/[a-zA-Z]/.test(preview)) {
    return {
      ok: false,
      message: "That CSV preview does not contain readable columns. Check the statement export and try again.",
    };
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

function getFileExtension(file) {
  return String(file?.name || "").split(".").pop()?.toLowerCase() || "";
}

async function readFileHead(file, length) {
  const buffer = await file.slice(0, length).arrayBuffer();
  return new Uint8Array(buffer);
}

function matchesSensitiveMagicBytes(bytes, extension) {
  if (extension === "heic" || extension === "heif") {
    return bytes.length >= 12 && decodeAscii(bytes.slice(4, 12)).startsWith("ftyphei");
  }

  if (extension === "webp") {
    return bytes.length >= 12 && decodeAscii(bytes.slice(0, 4)) === "RIFF" && decodeAscii(bytes.slice(8, 12)) === "WEBP";
  }

  const signatures = SENSITIVE_MAGIC_BYTES[extension] || [];
  return signatures.some((signature) => signature.every((value, index) => bytes[index] === value));
}

function hasBinarySignature(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return true;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return true;
  return false;
}

function looksLikeTextBytes(bytes) {
  let suspicious = 0;
  let checked = 0;

  for (const byte of bytes) {
    checked += 1;
    if (byte === 0) return false;
    const allowedControl = byte === 9 || byte === 10 || byte === 13;
    if (byte < 32 && !allowedControl) suspicious += 1;
  }

  return checked > 0 && suspicious / checked < 0.02;
}

function decodeTextPreview(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

function decodeAscii(bytes) {
  return Array.from(bytes).map((byte) => String.fromCharCode(byte)).join("");
}
