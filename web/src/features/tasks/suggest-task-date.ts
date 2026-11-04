/** Recognize a local clock time in a task title, using the next occurrence. */
export function suggestTaskDate(title: string, now = new Date()): Date | null {
  const time = title.match(
    /(?:^|\s)([01]?\d|2[0-3])(?:h([0-5]\d)?|:([0-5]\d))(?=$|[\s,.;!?])/iu,
  )
  if (!time) return null

  const date = new Date(now)
  date.setHours(Number(time[1]), Number(time[2] ?? time[3] ?? 0), 0, 0)
  if (/\bamanh[ãa](?=$|[\s,.;!?])/iu.test(title)) {
    date.setDate(date.getDate() + 1)
  } else if (date <= now && !/\bhoje\b/iu.test(title)) {
    date.setDate(date.getDate() + 1)
  }
  return date
}
