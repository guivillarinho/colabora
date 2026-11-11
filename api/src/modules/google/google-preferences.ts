export type GooglePreferences = {
  autoSync: boolean
  inboundEnabled: boolean
  defaultCalendarId: string
  categoryTaskListMap: Record<string, string>
}

export const defaultGooglePreferences: GooglePreferences = {
  autoSync: false,
  inboundEnabled: false,
  defaultCalendarId: 'primary',
  categoryTaskListMap: {},
}

export function googlePreferences(value: unknown): GooglePreferences {
  const raw =
    value && typeof value === 'object'
      ? (value as Partial<GooglePreferences>)
      : {}
  const map = raw.categoryTaskListMap
  return {
    autoSync: raw.autoSync === true,
    inboundEnabled: raw.inboundEnabled === true,
    defaultCalendarId:
      typeof raw.defaultCalendarId === 'string' && raw.defaultCalendarId
        ? raw.defaultCalendarId.slice(0, 256)
        : 'primary',
    categoryTaskListMap:
      map && typeof map === 'object' && !Array.isArray(map)
        ? Object.fromEntries(
            Object.entries(map)
              .filter(
                (entry): entry is [string, string] =>
                  typeof entry[0] === 'string' && typeof entry[1] === 'string',
              )
              .slice(0, 20)
              .map(([key, list]) => [key.slice(0, 40), list.slice(0, 128)]),
          )
        : {},
  }
}
