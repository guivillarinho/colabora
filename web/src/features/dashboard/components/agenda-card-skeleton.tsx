import { Skeleton } from '@/components/ui/skeleton'

export function AgendaCardSkeleton({ task = false }: { task?: boolean }) {
  return (
    <div className="grid min-h-44 w-full min-w-0 gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-1/3" />
        {task ? <Skeleton className="h-8 w-16 rounded-lg" /> : null}
      </div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-5 w-1/2 rounded-full" />
    </div>
  )
}
