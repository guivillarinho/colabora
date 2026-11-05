import test from 'node:test';
import assert from 'node:assert/strict';
import { securityHeaders } from './security-headers.mjs';
const directives = (headers) => Object.fromEntries(headers['Content-Security-Policy'].split('; ').map(d => {const [key, ...sources] = d.split(' '); return [key, sources]}));

test('blocks arbitrary external images, scripts, plugins and embedding while preserving UI resources', () => {
  const policy = directives(securityHeaders());
  assert.deepEqual(policy['img-src'], ["'self'", 'data:', 'blob:']);
  assert.deepEqual(policy['script-src'], ["'self'"]);
  assert.deepEqual(policy['script-src-attr'], ["'none'"]);
  assert.deepEqual(policy['object-src'], ["'none'"]);
  assert.deepEqual(policy['frame-ancestors'], ["'none'"]);
  assert.deepEqual(policy['style-src'], ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(policy['worker-src'], ["'self'", 'blob:']);
  assert.deepEqual(policy['font-src'], ["'self'"]);
  assert.deepEqual(policy['frame-src'], ['https://www.openstreetmap.org']);
  assert.ok(policy['connect-src'].includes('https://photon.komoot.io'));
  assert.ok(policy['connect-src'].includes('https://*.blob.vercel-storage.com'));
});
test('allows only the configured HTTPS avatar origin, never its path or query', () => {
  assert.deepEqual(directives(securityHeaders('https://images.example/avatar.png?token=private'))['img-src'], ["'self'", 'data:', 'blob:', 'https://images.example']);
});
for (const value of ['http://images.example/a.png', 'https://user:secret@images.example/a.png', 'https://*.example/a.png', 'javascript:alert(1)', 'https://images.example;img-src https:']) {
  test(`rejects unsafe avatar configuration ${value}`, () => assert.throws(() => securityHeaders(value)));
}
test('does not set wildcard CORS or no-store on public static assets', () => {
  assert.equal(securityHeaders()['Access-Control-Allow-Origin'], undefined);
  assert.equal(securityHeaders()['Cache-Control'], undefined);
});
