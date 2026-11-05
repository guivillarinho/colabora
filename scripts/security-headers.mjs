// Pure policy builder: importing it never installs, builds or runs migrations.
export function securityHeaders(avatarUrl = '') {
  const images = ["'self'", 'data:', 'blob:'];
  if (avatarUrl.trim()) {
    const url = new URL(avatarUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname.includes('*')) {
      throw new Error('VITE_USER_AVATAR_URL deve usar HTTPS sem credenciais ou wildcard.');
    }
    images.push(url.origin);
  }
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    // Inline styles remain necessary for Radix, next-themes and dynamic UI styles.
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "script-src-attr 'none'",
      "style-src 'self' 'unsafe-inline'",
      `img-src ${images.join(' ')}`,
      "font-src 'self'",
      "connect-src 'self' https://photon.komoot.io https://blob.vercel-storage.com https://*.blob.vercel-storage.com",
      'frame-src https://www.openstreetmap.org',
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  };
}
