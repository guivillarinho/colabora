import { useEffect, useState } from 'react'
import { googleStatus } from './google-api'

export function GoogleSyncHint({
  optOut,
  onOptOut,
}: {
  optOut: boolean
  onOptOut: (value: boolean) => void
}) {
  const [connected, setConnected] = useState(false)
  const [automatic, setAutomatic] = useState(false)
  useEffect(() => {
    let active = true
    googleStatus()
      .then((status) => {
        if (!active) return
        setConnected(status.configured && status.status === 'connected')
        setAutomatic(status.preferences?.autoSync === true)
      })
      .catch(() => {
        if (active) setConnected(false)
      })
    return () => {
      active = false
    }
  }, [])
  if (!connected) return null
  return (
    <div className="grid gap-2 rounded-xl border p-3">
      <p className="text-sm text-muted-foreground">
        {automatic
          ? 'A sincronização automática está ligada. Este item será enviado à sua conta Google.'
          : 'Sua conta Google está vinculada. Ligue a sincronização automática no perfil para enviar este item.'}
      </p>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={optOut}
          onChange={(event) => onOptOut(event.target.checked)}
        />
        Não sincronizar desta vez
      </label>
    </div>
  )
}
