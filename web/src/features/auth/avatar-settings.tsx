import { useRef, useState } from 'react'
import { Camera, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { useAuth } from './auth-context'
import { avatarPresets, UserAvatar } from './user-avatar'
import { removeAvatar, selectAvatarPreset, uploadAvatar } from './upload-avatar'

export function AvatarSettings({ onDone }: { onDone: () => void }) {
  const { user, updateUser } = useAuth()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function apply(action: () => Promise<typeof user>) {
    if (!user || pending) return
    setPending(true)
    setError(null)
    try {
      const next = await action()
      if (next) updateUser(next)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível atualizar a foto.',
      )
    } finally {
      setPending(false)
    }
  }

  async function onFile(file: File | undefined, input: HTMLInputElement) {
    if (!file || !user) return
    const local = URL.createObjectURL(file)
    setPreview(local)
    try {
      await apply(() => uploadAvatar(file, user.id))
    } finally {
      URL.revokeObjectURL(local)
      setPreview(null)
      input.value = ''
    }
  }

  return (
    <section
      aria-label="Edição da foto de perfil"
      className="flex min-h-0 w-full min-w-0 flex-col gap-3"
    >
      <div className="grid min-h-0 gap-4 overflow-y-auto px-1 py-1">
        <div className="grid justify-items-center gap-3">
          {preview ? (
            <img
              alt="Prévia da nova foto"
              className="size-28 rounded-full border border-primary/20 object-cover sm:size-32"
              src={preview}
            />
          ) : (
            <UserAvatar size="xl" />
          )}
          <div className="flex items-center justify-center gap-3">
            <Button
              aria-label={pending ? 'Enviando foto...' : 'Enviar foto'}
              title="Enviar foto"
              className="size-11 rounded-full"
              size="icon"
              disabled={pending}
              type="button"
              onClick={() => fileRef.current?.click()}
            >
              <span aria-hidden="true" className="relative">
                <Camera className="size-5" />
                <Plus className="absolute -top-1 -right-1 size-3 rounded-full bg-primary stroke-3" />
              </span>
            </Button>
            <input
              ref={fileRef}
              accept="image/png,image/jpeg,image/webp"
              aria-label="Arquivo da foto"
              className="sr-only"
              disabled={pending}
              type="file"
              onChange={(event) => {
                const input = event.currentTarget
                onFile(input.files?.[0], input)
              }}
            />
            {user?.avatar ? (
              <Button
                aria-label="Excluir foto de perfil"
                title="Excluir foto de perfil"
                className="size-11 rounded-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                size="icon"
                disabled={pending}
                type="button"
                variant="outline"
                onClick={() => {
                  setConfirmingDelete(true)
                }}
              >
                <Trash2 aria-hidden="true" className="size-5" />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid justify-items-center gap-3">
          <p className="text-sm text-muted-foreground">ou escolha um avatar</p>
          <div
            aria-label="Avatares predefinidos"
            className="flex flex-wrap justify-center gap-3 px-1 py-1"
            role="group"
          >
            {avatarPresets.map((preset) => {
              const selected =
                user?.avatar?.kind === 'preset' && user.avatar.id === preset.id
              const Icon = preset.icon
              return (
                <button
                  key={preset.id}
                  aria-label={preset.label}
                  aria-pressed={selected}
                  className={`flex size-11 items-center justify-center rounded-full border ${preset.className} ${selected ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}`}
                  disabled={pending}
                  type="button"
                  onClick={() => {
                    apply(() => selectAvatarPreset(preset.id))
                  }}
                >
                  <Icon aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {pending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Salvando alterações...
          </p>
        ) : null}
      </div>
      <Button
        className="h-11 w-full shrink-0"
        disabled={pending}
        type="button"
        onClick={onDone}
      >
        Concluir
      </Button>
      <DeleteConfirmationDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        entity="foto de perfil"
        name="sua foto de perfil"
        description="Deseja excluir sua foto de perfil? Você poderá enviar outra foto ou escolher um avatar depois."
        onConfirm={async () => {
          const next = await removeAvatar()
          updateUser(next)
        }}
      />
    </section>
  )
}
