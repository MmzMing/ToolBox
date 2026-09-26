/**
 * 从 DataTransfer 取出全部文件，含拖入文件夹时的递归遍历。
 * 图片压缩与图片堆叠两个工具共用，故落在 utils（AGENTS.md §7）。
 */
export async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const files: File[] = []
  const entries: FileSystemEntry[] = []
  for (const item of dataTransfer.items) {
    const entry = item.webkitGetAsEntry?.()
    if (entry) {
      entries.push(entry)
    } else {
      const file = item.getAsFile()
      if (file) {
        files.push(file)
      }
    }
  }

  async function walk(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) =>
        (entry as FileSystemFileEntry).file(resolve, () => resolve(null)),
      )
      if (file) {
        files.push(file)
      }
    } else if (entry.isDirectory) {
      for (const child of await readDirectory(entry as FileSystemDirectoryEntry)) {
        await walk(child)
      }
    }
  }

  await Promise.all(entries.map(walk))
  return files
}

/** readEntries 单次最多返回 100 项，必须循环读到空为止才算读完 */
async function readDirectory(reader: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const directoryReader = reader.createReader()
  const readAll = async (): Promise<FileSystemEntry[]> => {
    const results = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      directoryReader.readEntries(resolve, reject),
    )
    if (results.length === 0) {
      return []
    }
    return results.concat(await readAll())
  }
  return readAll()
}

/** 剪贴板里的图片文件（截图粘贴、从别处复制的图） */
export function imageFilesFromClipboard(clipboardData: DataTransfer | null): File[] {
  const files: File[] = []
  for (const item of clipboardData?.items ?? []) {
    if (!item.type.startsWith('image/')) {
      continue
    }
    const file = item.getAsFile()
    if (file) {
      files.push(file)
    }
  }
  return files
}
