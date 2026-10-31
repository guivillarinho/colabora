import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DeleteConfirmationDialog } from './delete-confirmation-dialog'

it('cancels without deleting', async () => {
  const onConfirm = jest.fn()
  const onOpenChange = jest.fn()
  render(
    <DeleteConfirmationDialog
      open
      entity="projeto"
      name="Planejamento"
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
    />,
  )
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(onConfirm).not.toHaveBeenCalled()
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

it('keeps the dialog open after a failure and allows retrying', async () => {
  const user = userEvent.setup()
  const onConfirm = jest
    .fn()
    .mockRejectedValueOnce(new Error('Falha ao excluir.'))
    .mockResolvedValueOnce(undefined)
  const onOpenChange = jest.fn()
  render(
    <DeleteConfirmationDialog
      open
      entity="evento"
      name="Reunião"
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Falha ao excluir.',
  )
  expect(onOpenChange).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  expect(onConfirm).toHaveBeenCalledTimes(2)
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
