import { attachmentReference, parseAttachment } from './attachment-reference'

const file = '/uploads/agenda/7d7f0a4e-6c2b-4f1a-9d3e-1b2c3d4e5f60.pdf'

it('stores a name that cannot break the reference separator', () => {
  expect(attachmentReference('a||b.pdf', '/uploads/agenda/file.pdf')).toBe(
    'a b.pdf||/uploads/agenda/file.pdf',
  )
})

it('keeps a stored file address and ignores anything else', () => {
  expect(parseAttachment(`proposta.pdf||${file}`)).toEqual({
    name: 'proposta.pdf',
    url: file,
  })
  expect(parseAttachment('somente-o-nome.pdf')).toEqual({
    name: 'somente-o-nome.pdf',
    url: null,
  })
  expect(parseAttachment(`proposta.pdf||https://evil.test/${file}`)).toEqual({
    name: 'proposta.pdf',
    url: null,
  })
  expect(parseAttachment('')).toEqual({ name: '', url: null })
})
