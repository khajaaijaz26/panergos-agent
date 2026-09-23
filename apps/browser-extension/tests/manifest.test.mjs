import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('can identify the active page while keeping page control site-scoped', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url)))
  assert.equal(manifest.permissions.includes('tabs'), true)
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false)
  assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*'])
  assert.doesNotMatch(manifest.content_security_policy.extension_pages, /connect-src[^;]*(?:^|\s)(?:http:|ws:)(?:\s|;)/)
})
