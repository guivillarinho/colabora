import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

export async function renderPdfPreview(
  file: Blob,
  width = 140,
): Promise<string> {
  const loading = pdfjs.getDocument({ data: await file.arrayBuffer() })
  try {
    const document = await loading.promise
    const page = await document.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({
      scale: Math.min(width / base.width, (width * 1.5) / base.height),
    })
    const canvas = window.document.createElement('canvas')

    canvas.width = Math.max(1, viewport.width)
    canvas.height = Math.max(1, viewport.height)

    await page.render({ canvas, viewport }).promise

    return canvas.toDataURL('image/jpeg', 0.65)
  } finally {
    await loading.destroy()
  }
}
