import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

export async function renderPdfPreview(file: File): Promise<string> {
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() })
    .promise
  const page = await document.getPage(1)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: 140 / base.width })
  const canvas = window.document.createElement('canvas')

  canvas.width = viewport.width
  canvas.height = viewport.height

  await page.render({ canvas, viewport }).promise

  return canvas.toDataURL('image/jpeg', 0.4)
}
