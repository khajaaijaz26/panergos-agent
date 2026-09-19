const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/bmp': '.bmp',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
}

type ClipboardItemLike = {
  readonly types: readonly string[]
  getType(type: string): Promise<unknown>
}

export async function readClipboardImage(items: readonly ClipboardItemLike[]) {
  for (const item of items) {
    const type = item.types.find(candidate => IMAGE_EXTENSIONS[candidate.toLowerCase()])

    if (!type) {
      continue
    }

    const blob = await item.getType(type)

    if (typeof blob !== 'object' || blob === null || !('arrayBuffer' in blob)) {
      continue
    }

    const arrayBuffer = (blob as { arrayBuffer(): Promise<ArrayBuffer> }).arrayBuffer

    if (typeof arrayBuffer !== 'function') {
      continue
    }

    return {
      buffer: Buffer.from(await arrayBuffer.call(blob)),
      extension: IMAGE_EXTENSIONS[type.toLowerCase()]
    }
  }

  return null
}
