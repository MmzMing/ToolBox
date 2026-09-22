import JSZip from 'jszip'

import { buildImageFileName } from '@/utils/file-name'
import { insertPngTextChunks } from '@/utils/png-text'

import type { ImageRecord } from './idb'

/** 打包原图 + PNG iTXt 元数据 + metadata.json，纯本地生成 */
export async function buildExportZip(records: readonly ImageRecord[]): Promise<Blob> {
  const zip = new JSZip()
  const manifest: unknown[] = []
  for (const record of records) {
    const name = buildImageFileName(record.meta.prompt, record.meta.createdAt, record.mimeType)
    let bytes = new Uint8Array(await record.blob.arrayBuffer())
    if (record.mimeType === 'image/png') {
      bytes = insertPngTextChunks(bytes, [
        ['Description', record.meta.prompt],
        ['Model', `${record.meta.provider}/${record.meta.model}`],
        ['Parameters', JSON.stringify(record.meta.params)],
        ['Generated', new Date(record.meta.createdAt).toISOString()],
      ])
    }
    zip.file(name, bytes)
    manifest.push({ file: name, ...record.meta })
  }
  zip.file(
    'metadata.json',
    JSON.stringify(
      { exportedAt: new Date().toISOString(), tool: 'ai-image-gen', images: manifest },
      null,
      2,
    ),
  )
  return zip.generateAsync({ type: 'blob' })
}

export async function downloadZip(blob: Blob, fileName = 'ai-image-gen-export.zip') {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
