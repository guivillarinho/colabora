// The same exact allowlist protects CORS and CSRF. No patterns or URL paths.
export function webOrigins(
  configured: string | undefined,
  production = process.env.NODE_ENV === 'production' ||
    Boolean(process.env.VERCEL),
): string[] {
  const origins = new Set<string>()
  for (const value of (
    configured ?? (production ? '' : 'http://localhost:5173')
  ).split(',')) {
    const candidate = value.trim()
    if (!candidate) continue
    let url: URL
    try {
      url = new URL(candidate)
    } catch {
      throw new Error(
        'WEB_ORIGIN deve conter apenas origens HTTP(S) explícitas.',
      )
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.hostname.includes('*')
    )
      throw new Error(
        'WEB_ORIGIN deve conter apenas origens HTTP(S) explícitas.',
      )
    origins.add(url.origin)
    if (!production && ['localhost', '127.0.0.1'].includes(url.hostname)) {
      url.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost'
      origins.add(url.origin)
    }
  }
  return [...origins]
}
