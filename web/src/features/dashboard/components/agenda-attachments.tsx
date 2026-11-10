import { useEffect, useState } from 'react'
import { Download, FileText } from 'lucide-react'

import { MutedText } from '@/components/typography'
import { parseAttachment } from '@/features/tasks/components/attachment-reference'
import { apiBase, apiBlob } from '@/lib/http-client'

type Preview = { image: string; label: string } | { text: string }

export function AgendaAttachments({ attachments }: { attachments: string[] }) {
  return (
    <section aria-label="Documentos" className="grid min-w-0 gap-2">
      <h3 className="font-medium">Documentos</h3>
      <ul className="grid min-w-0 gap-2">
        {Array.from(new Set(attachments)).map((reference) => {
          const { name, url } = parseAttachment(reference)
          return (
            <li
              key={reference}
              className="grid min-w-0 gap-2 rounded-xl border p-3"
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <FileText
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="wrap-anywhere">{name || 'Arquivo'}</span>
                </span>
                {url ? (
                  <a
                    aria-label={`Baixar ${name}`}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                    href={`${apiBase}${url}`}
                    download={name}
                  >
                    <Download aria-hidden="true" className="size-4" />
                    Baixar
                  </a>
                ) : null}
              </div>
              {url ? (
                <AttachmentPreview name={name} url={url} />
              ) : (
                <MutedText>Arquivo indisponível.</MutedText>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function AttachmentPreview({ name, url }: { name: string; url: string }) {
  const image = /\.(png|jpe?g|webp)$/i.test(url)
  const pdf = /\.pdf$/i.test(url)
  const text = /\.(txt|csv)$/i.test(url)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!image && !pdf && !text) return
    const controller = new AbortController()
    let objectUrl: string | undefined

    async function load() {
      const file = await apiBlob(url, controller.signal)
      if (controller.signal.aborted) return
      if (image && /^image\/(png|jpeg|webp)$/.test(file.type)) {
        objectUrl = URL.createObjectURL(file)
        setPreview({ image: objectUrl, label: `Prévia de ${name}` })
      } else if (pdf && file.type === 'application/pdf') {
        const { renderPdfPreview } =
          await import('@/features/tasks/components/pdf-preview')
        if (controller.signal.aborted) return
        const page = await renderPdfPreview(file, 700)
        if (!controller.signal.aborted)
          setPreview({ image: page, label: `Primeira página de ${name}` })
      } else if (text && /^text\/(plain|csv)(;|$)/.test(file.type)) {
        const excerpt = await file.slice(0, 4096).text()
        if (!controller.signal.aborted)
          setPreview({ text: excerpt + (file.size > 4096 ? '\n…' : '') })
      } else {
        throw new Error('Formato de prévia indisponível.')
      }
    }

    load().catch(() => {
      if (!controller.signal.aborted) setFailed(true)
    })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [image, name, pdf, text, url])

  if (!image && !pdf && !text)
    return <MutedText>Baixe o arquivo para abrir neste formato.</MutedText>
  if (failed) return <MutedText>Não foi possível exibir a prévia.</MutedText>
  if (!preview)
    return (
      <p role="status" className="text-muted-foreground">
        Carregando prévia...
      </p>
    )
  if ('text' in preview)
    return (
      <pre className="max-h-52 min-w-0 overflow-auto whitespace-pre-wrap wrap-anywhere rounded-lg bg-muted p-3 text-xs">
        {preview.text}
      </pre>
    )
  return (
    <img
      alt={preview.label}
      className="max-h-80 w-full rounded-lg bg-muted object-contain"
      src={preview.image}
      onError={() => setFailed(true)}
    />
  )
}
