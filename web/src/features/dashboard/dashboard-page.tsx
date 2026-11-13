import { useCallback, useEffect, useState } from 'react'

import { MutedText, PageTitle } from '@/components/typography'
import { useNavigation } from '@/components/layout/navigation'
import { googleStatus, googleSyncNow } from '@/features/google/google-api'
import { useTasks } from '@/features/tasks/tasks-context'

import { ProgressSummary } from './components/progress-summary'
import { TaskTimeline, timelineTasks } from './components/task-timeline'
import { ActiveTimer } from './components/active-timer'
import { TodayAgenda, useTodayAgenda } from './components/today-agenda'
import { CardSelectionActions } from './components/card-selection'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'

export function DashboardPage() {
  const { tasks, loading, completeTask, removeTask } = useTasks()
  const { goTo } = useNavigation()

  const todayAgenda = useTodayAgenda()
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const selectableCards = [
    ...(todayAgenda.todayItems ?? []).map((item) => ({
      key: `${item.type}-${item.id}`,
      title: item.title,
      remove: () => todayAgenda.removeItem(item.id),
    })),
    ...(loading ? [] : timelineTasks(tasks, true))
      .filter((task) => task.permissions.delete)
      .map((task) => ({
        key: `task-${task.id}`,
        title: task.title,
        remove: () => removeTask(task.id),
      })),
  ]
  const selectedCards = selectableCards.filter((card) =>
    selected?.has(card.key),
  )
  const allSelected =
    selectableCards.length > 0 &&
    selectedCards.length === selectableCards.length
  const toggleSelection = useCallback((key: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  const cancelSelection = () => setSelected(null)
  const selection = selected
    ? { selected, toggle: toggleSelection, cancel: cancelSelection }
    : undefined

  async function deleteSelectedCards() {
    const failures: string[] = []
    for (const card of selectedCards) {
      try {
        await card.remove()
        setSelected((current) => {
          const remaining = new Set(current)
          remaining.delete(card.key)
          return remaining
        })
      } catch {
        failures.push(card.title)
      }
    }
    if (failures.length)
      throw new Error(`Não foi possível excluir: ${failures.join(', ')}.`)
    cancelSelection()
  }

  const completed = tasks.filter((task) => task.status === 'completed').length

  useEffect(() => {
    let active = true
    googleStatus()
      .then(async (status) => {
        if (
          !active ||
          !status.configured ||
          status.status !== 'connected' ||
          !status.preferences?.inboundEnabled
        )
          return
        await googleSyncNow()
        if (active) window.dispatchEvent(new Event('colabora-google-synced'))
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <div className="grid gap-1">
        <PageTitle>Hoje</PageTitle>
        <MutedText>Seu progresso e o que vem a seguir.</MutedText>
      </div>
      <ActiveTimer
        tasks={tasks}
        onComplete={(taskId) => completeTask(taskId)}
      />
      <ProgressSummary completed={completed} total={tasks.length} />
      {selection ? (
        <CardSelectionActions
          count={selectedCards.length}
          allSelected={allSelected}
          onToggleAll={() =>
            setSelected(
              new Set(
                allSelected ? [] : selectableCards.map((card) => card.key),
              ),
            )
          }
          onCancel={cancelSelection}
          onDelete={() => setDeleteOpen(true)}
        />
      ) : null}
      <TodayAgenda
        {...todayAgenda}
        selection={selection}
        onHold={toggleSelection}
        onViewAll={() => goTo('agenda')}
      />
      <TaskTimeline
        tasks={tasks}
        loading={loading}
        preview
        selection={selection}
        onHold={toggleSelection}
        onComplete={(taskId, actualTime) => completeTask(taskId, actualTime)}
        onDelete={(taskId) => removeTask(taskId)}
        onViewAll={() => goTo('agenda')}
      />
      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entity="itens selecionados"
        name={`${selectedCards.length} itens`}
        description={`Excluir ${selectedCards.length} item(ns)? Essa ação não pode ser desfeita.`}
        onConfirm={deleteSelectedCards}
      />
    </div>
  )
}
