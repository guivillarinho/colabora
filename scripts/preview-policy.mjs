// No I/O or database connections. Preview must be provisioned/reviewed separately.
// Gemini text and Google Calendar stay off unless the Preview-only flags below
// are exactly "true". Prefixed secrets are copied into the runtime names and
// then removed. Inherited GEMINI_* / GOOGLE_* values are never reused.
const previewGeminiFlag = "COLABORA_PREVIEW_GEMINI";
const previewGoogleFlag = "COLABORA_PREVIEW_GOOGLE";
const previewBlobFlag = "COLABORA_PREVIEW_BLOB";

function enablePreviewBlob(env, result) {
  if (env[previewBlobFlag] !== "true") return;
  const token = env.COLABORA_PREVIEW_BLOB_READ_WRITE_TOKEN;
  const store = env.COLABORA_PREVIEW_BLOB_STORE_ID;
  const tokenStore =
    typeof token === "string"
      ? /^vercel_blob_rw_([a-z0-9]+)_[a-z0-9_-]{20,}$/i.exec(token)?.[1]
      : undefined;
  if (
    typeof store !== "string" ||
    !/^store_[a-z0-9]+$/i.test(store) ||
    !tokenStore ||
    `store_${tokenStore}`.toLowerCase() !== store.toLowerCase()
  )
    throw new Error(
      "Preview Blob exige token prefixado do armazenamento privado isolado indicado por COLABORA_PREVIEW_BLOB_STORE_ID; o token herdado não é reutilizado.",
    );
  result.BLOB_READ_WRITE_TOKEN = token;
}

function previewSecret(env, key) {
  const value = env[`COLABORA_PREVIEW_${key}`];
  return typeof value === "string" ? value : "";
}

function enablePreviewGemini(env, result) {
  if (env[previewGeminiFlag] !== "true") return;
  const key = previewSecret(env, "GEMINI_API_KEY");
  if (
    key.length < 20 ||
    key.length > 200 ||
    /[\s"'\\]/.test(key) ||
    key.includes("://") ||
    key === env.SESSION_SECRET
  )
    throw new Error(
      "Preview Gemini exige COLABORA_PREVIEW_GEMINI_API_KEY exclusiva para texto, distinta de SESSION_SECRET. A variável GEMINI_API_KEY herdada não é reutilizada.",
    );
  result.GEMINI_ENABLED = "true";
  result.GEMINI_API_KEY = key;
}

function enablePreviewGoogle(env, result) {
  if (env[previewGoogleFlag] !== "true") return;
  const redirect = `${result.PUBLIC_APP_URL}/api/google/callback`;
  const supplied = env.COLABORA_PREVIEW_GOOGLE_REDIRECT_URI;
  if (typeof supplied === "string" && supplied !== redirect)
    throw new Error(
      `Preview Google só aceita o callback deste deployment: ${redirect}.`,
    );
  const clientId = previewSecret(env, "GOOGLE_CLIENT_ID");
  const clientSecret = previewSecret(env, "GOOGLE_CLIENT_SECRET");
  const encryptionKey = previewSecret(env, "GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (!/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(clientId))
    throw new Error(
      "Preview Google exige COLABORA_PREVIEW_GOOGLE_CLIENT_ID de um cliente OAuth Web.",
    );
  if (
    !/^[A-Za-z0-9_-]{16,256}$/.test(clientSecret) ||
    clientSecret === clientId ||
    clientSecret === env.SESSION_SECRET
  )
    throw new Error(
      "Preview Google exige COLABORA_PREVIEW_GOOGLE_CLIENT_SECRET exclusivo.",
    );
  const decoded = Buffer.from(encryptionKey, "base64");
  const canonical = decoded.toString("base64");
  if (
    decoded.length !== 32 ||
    canonical.replace(/=+$/, "") !== encryptionKey.replace(/=+$/, "") ||
    encryptionKey === env.SESSION_SECRET ||
    decoded.equals(Buffer.from(env.SESSION_SECRET))
  )
    throw new Error(
      "Preview Google exige COLABORA_PREVIEW_GOOGLE_TOKEN_ENCRYPTION_KEY com 32 bytes em base64, distinta de SESSION_SECRET.",
    );
  result.GOOGLE_ENABLED = "true";
  result.GOOGLE_CLIENT_ID = clientId;
  result.GOOGLE_CLIENT_SECRET = clientSecret;
  result.GOOGLE_TOKEN_ENCRYPTION_KEY = encryptionKey;
  result.GOOGLE_REDIRECT_URI = redirect;
  result.GOOGLE_WEBHOOK_URL = `${result.PUBLIC_APP_URL}/api/google/webhook/calendar`;
}

export function previewEnvironment(env) {
  if (env.VERCEL_ENV !== "preview") return env;
  // Vercel's Neon Marketplace resource is connected with a dedicated prefix so
  // pre-existing shared Preview/Production variables remain untouched.
  const databaseUrl = env.COLABORA_PREVIEW_DATABASE_URL || env.DATABASE_URL;
  const unpooledUrl =
    env.COLABORA_PREVIEW_DATABASE_URL_UNPOOLED || env.DATABASE_URL_UNPOOLED;
  const expected =
    env.COLABORA_PREVIEW_DB_HOST ||
    env.COLABORA_PREVIEW_POSTGRES_HOST ||
    env.COLABORA_PREVIEW_PGHOST;
  if (!expected || !/^[a-z0-9.-]+\.neon\.tech$/.test(expected))
    throw new Error(
      "Preview exige COLABORA_PREVIEW_DB_HOST de um banco Neon isolado previamente auditado.",
    );
  const canonical = (host) => host.replace("-pooler.", ".");
  for (const [key, value] of [
    ["DATABASE_URL", databaseUrl],
    ["DATABASE_URL_UNPOOLED", unpooledUrl],
  ]) {
    if (!value) {
      if (key === "DATABASE_URL")
        throw new Error("Preview exige DATABASE_URL isolada.");
      continue;
    }
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Conexão de Preview inválida.");
    }
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      canonical(url.hostname) !== canonical(expected)
    )
      throw new Error("Banco de Preview diverge do host isolado aprovado.");
  }
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)
    throw new Error(
      "Preview exige SESSION_SECRET próprio, com pelo menos 32 caracteres.",
    );
  const hostname = env.VERCEL_URL;
  if (!hostname || !/^[a-z0-9-]+\.vercel\.app$/.test(hostname))
    throw new Error("Preview exige URL de deployment Vercel exata.");
  const result = {
    ...env,
    DATABASE_URL: databaseUrl,
    ...(unpooledUrl ? { DATABASE_URL_UNPOOLED: unpooledUrl } : {}),
    VERCEL: "1",
    GEMINI_ENABLED: "false",
    GOOGLE_ENABLED: "false",
    WEB_ORIGIN: `https://${hostname}`,
    PUBLIC_APP_URL: `https://${hostname}`,
  };
  // Never inherit production services/legacy database aliases into a Preview artifact.
  for (const key of Object.keys(result)) {
    if (/^(PG|POSTGRES_|DB_|COLABORA_PREVIEW_)/.test(key)) delete result[key];
    if (
      /^(BLOB_|BREVO_|VAPID_|GOOGLE_|GEMINI_)/.test(key) &&
      !key.endsWith("_ENABLED")
    )
      result[key] = "";
  }
  // Each Preview service has its own opt-in and isolated, prefixed credentials.
  enablePreviewGemini(env, result);
  enablePreviewGoogle(env, result);
  enablePreviewBlob(env, result);
  for (const key of [
    "PASSWORD_RESET_FROM_EMAIL",
    "PASSWORD_RESET_FROM_NAME",
    "REMINDER_DISPATCH_SECRET",
  ])
    result[key] = "";
  result.DB_SSL = "true";
  result.DB_SCHEMA = "public";
  result.VITE_USER_AVATAR_URL = "";
  return result;
}

export function applyPreviewEnvironment(env) {
  const safe = previewEnvironment(env);
  if (safe === env) return;
  for (const key of Object.keys(env)) if (!(key in safe)) delete env[key];
  Object.assign(env, safe);
}
