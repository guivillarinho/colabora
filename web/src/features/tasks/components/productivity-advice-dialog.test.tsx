import { render, screen } from '@testing-library/react'

import { ProductivityAdviceDialog } from './productivity-advice-dialog'

const advice = 'Considere dividir esta tarefa em partes menores da próxima vez.'

describe('ProductivityAdviceDialog', () => {
  it('shows the advice when the task took longer than expected', () => {
    render(
      <ProductivityAdviceDialog advice={advice} onClose={() => undefined} />,
    )

    expect(screen.getByText(advice)).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Conselho de produtividade' }),
    ).toBeVisible()
  })

  it('stays closed when there is no advice', () => {
    render(<ProductivityAdviceDialog advice={null} onClose={() => undefined} />)

    expect(screen.queryByText(advice)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Conselho de produtividade' }),
    ).not.toBeInTheDocument()
  })
})
