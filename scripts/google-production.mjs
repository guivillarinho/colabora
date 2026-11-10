// Validate opt-in Google configuration without printing credentials.
export function validateProductionGoogle(env) {
  if (env.GOOGLE_ENABLED !== "true") return;
  const invalid = () => {
    throw new Error("Configuração de produção do Google Agenda incompleta ou inválida.");
  };
  if (
    !/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(env.GOOGLE_CLIENT_ID ?? "") ||
    !/^[A-Za-z0-9_-]{16,256}$/.test(env.GOOGLE_CLIENT_SECRET ?? "") ||
    env.GOOGLE_CLIENT_SECRET === env.SESSION_SECRET
  ) invalid();

  const key = env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "";
  const bytes = Buffer.from(key, "base64");
  if (
    bytes.length !== 32 ||
    bytes.toString("base64") !== key ||
    key === env.SESSION_SECRET ||
    bytes.equals(Buffer.from(env.SESSION_SECRET ?? ""))
  ) invalid();

  try {
    const app = new URL(env.PUBLIC_APP_URL);
    if (
      app.protocol !== "https:" || app.username || app.password ||
      app.pathname !== "/" || app.search || app.hash ||
      env.GOOGLE_REDIRECT_URI !== app.origin + "/api/google/callback"
    ) invalid();
  } catch {
    invalid();
  }
}
