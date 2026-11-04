import { render, screen } from '@testing-library/react'
import { LinkedText } from './linked-text'

it('makes web links clickable and preserves surrounding text and punctuation', () => {
  const text =
    'Consulte https://exemplo.com/documento.\nDepois visite www.exemplo.com (https://exemplo.com/a_(b)).'
  const { container } = render(
    <p>
      <LinkedText>{text}</LinkedText>
    </p>,
  )
  const links = screen.getAllByRole('link')
  expect(links).toHaveLength(3)
  expect(links[0]).toHaveAttribute('href', 'https://exemplo.com/documento')
  expect(links[1]).toHaveAttribute('href', 'https://www.exemplo.com')
  expect(links[2]).toHaveAttribute('href', 'https://exemplo.com/a_(b)')
  for (const link of links) {
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
  expect(container).toHaveTextContent(
    'Consulte https://exemplo.com/documento (abre em nova aba).',
  )
})

it('keeps markup and executable schemes as plain text', () => {
  render(
    <LinkedText>
      {'<script>alert(1)</script> javascript:alert(1) data:text/html,test'}
    </LinkedText>,
  )
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  expect(document.querySelector('script')).toBeNull()
  expect(screen.getByText(/<script>alert/)).toBeVisible()
})
