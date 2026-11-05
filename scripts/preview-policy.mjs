// No I/O or database connections. Preview must be provisioned/reviewed separately.
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
    if (/^(PG|POSTGRES_|DB_|COLABORA_PREVIEW_)/.test(key))
      delete result[key];
    if (
      /^(BLOB_|BREVO_|VAPID_|GOOGLE_|GEMINI_)/.test(key) &&
      !key.endsWith("_ENABLED")
    )
      result[key] = "";
  }
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
