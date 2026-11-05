import { webOrigins } from './web-origins'

describe('webOrigins', () => {
  it('normalizes and deduplicates exact origins without expanding production hosts', () => {
    expect(
      webOrigins(
        ' https://app.example/ ,https://app.example,http://localhost:5173',
        true,
      ),
    ).toEqual(['https://app.example', 'http://localhost:5173'])
  })
  it('permits loopback aliases only in development, consistently for CSRF and CORS', () => {
    expect(webOrigins(undefined, false)).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ])
    expect(webOrigins('https://localhost.example', false)).toEqual([
      'https://localhost.example',
    ])
    expect(webOrigins(undefined, true)).toEqual([])
  })
  it.each([
    '*',
    'null',
    'https://*.example',
    'https://user:password@example.test',
    'https://example.test/path',
    'https://example.test/?q=x',
    'https://example.test/#hash',
    'file:///tmp/test',
  ])('rejects unsafe or ambiguous configuration: %s', (origin) => {
    expect(() => webOrigins(origin, true)).toThrow('WEB_ORIGIN')
  })
})
