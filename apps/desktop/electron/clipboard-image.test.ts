import assert from 'node:assert/strict'

import { test } from 'vitest'

import { readClipboardImage } from './clipboard-image'

test('readClipboardImage returns the first supported image payload', async () => {
  const image = await readClipboardImage([
    { types: ['text/plain'], getType: async () => 'ignored' },
    { types: ['image/png'], getType: async () => new Blob([new Uint8Array([1, 2, 3])]) }
  ])

  assert.equal(image?.extension, '.png')
  assert.deepEqual(image?.buffer, Buffer.from([1, 2, 3]))
})

test('readClipboardImage ignores unsupported clipboard formats', async () => {
  assert.equal(
    await readClipboardImage([{ types: ['text/plain', 'image/tiff'], getType: async () => new Blob() }]),
    null
  )
})
