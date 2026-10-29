export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safe / 60)
  const rest = safe % 60

  if (hours === 0) {
    return `${rest} min`
  }

  if (rest === 0) {
    return `${hours} h`
  }

  return `${hours} h ${rest} min`
}

export function formatDueDate(iso: string | null): string {
  if (!iso) {
    return 'Sem data'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}
