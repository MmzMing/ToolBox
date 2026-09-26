import JSZip from 'jszip'

export type SliceFile = { name: string; blob: Blob }

/** 把切片打包成一个 zip blob，纯本地生成 */
export async function buildSliceZip(slices: readonly SliceFile[]): Promise<Blob> {
  const zip = new JSZip()
  for (const slice of slices) {
    zip.file(slice.name, slice.blob)
  }
  return zip.generateAsync({ type: 'blob' })
}
