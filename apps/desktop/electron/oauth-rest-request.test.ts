import { createServer } from 'node:http'

import { expect, test } from 'vitest'

import { httpStatusError } from './api-transport'
import { isGatewayAuthRejection } from './connection-config'
import { NativeAuthChangedError } from './native-access-token'
import { multipartBody } from './oauth-net-request'
import { mintGatewayWsTicket, requestOauthJson, requestWithOauthFallback } from './oauth-rest-request'

test('OAuth uploads preserve multipart bytes and authenticate both transports', async () => {
  const received: Array<{ body: Buffer; headers: Record<string, string | string[] | undefined> }> = []

  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []

    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk))
    }

    received.push({ body: Buffer.concat(chunks), headers: request.headers })
    response.setHeader('content-type', 'application/json')
    response.end('{"ok":true}')
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`

  const upload = {
    bytes: Buffer.from([0, 255, 13, 10, 65]),
    contentType: 'application/octet-stream',
    filename: 'proof"\n.bin'
  }

  const send = async (url: string, options: any, authHeaders: Record<string, string>) => {
    const multipart = multipartBody(options.upload)

    const response = await fetch(url, {
      body: new Uint8Array(multipart.body),
      headers: { 'content-type': multipart.contentType, ...authHeaders },
      method: options.method
    })

    return response.json()
  }

  const request = (accessToken: string | null) =>
    requestOauthJson(baseUrl, `${baseUrl}/upload`, { method: 'POST', upload }, {
      ensureNativeAccessToken: async () => accessToken,
      fetchJson: (url, _token, options) => send(url, options, { authorization: `Bearer ${options.bearer}` }),
      fetchJsonViaOauthSession: (url, options) => send(url, options, { cookie: 'oauth=live' })
    })

  try {
    await request('native-live')
    await request(null)

    expect(received).toHaveLength(2)
    expect(received[0].headers.authorization).toBe('Bearer native-live')
    expect(received[0].headers.cookie).toBeUndefined()
    expect(received[1].headers.authorization).toBeUndefined()
    expect(received[1].headers.cookie).toBe('oauth=live')

    for (const entry of received) {
      const contentType = String(entry.headers['content-type'])
      const boundary = `--${contentType.split('boundary=')[1]}`
      const payloadStart = entry.body.indexOf(Buffer.from('\r\n\r\n')) + 4
      const footer = Buffer.from(`\r\n${boundary}--\r\n`)

      expect(contentType).toMatch(/^multipart\/form-data; boundary=----panergos-/)
      expect(entry.body.toString('latin1')).toContain('filename="proof__.bin"')
      expect(entry.body.subarray(payloadStart, entry.body.length - footer.length)).toEqual(upload.bytes)
    }
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
  }
})

test('native failures remain transport failures unless an independent cookie session succeeds', async () => {
  for (const nativeError of [new Error('timeout'), httpStatusError(503, 'down'), new Error('malformed response')]) {
    for (const cookieWorks of [true, false]) {
      const run = () =>
        requestWithOauthFallback('https://gw.test', {
          ensureNativeAccessToken: async () => {
            throw nativeError
          },
          requestWithBearer: async () => 'bearer',
          requestWithCookie: async () => {
            if (cookieWorks) {
              return 'cookie'
            }

            throw httpStatusError(401, 'no cookie')
          }
        })

      if (cookieWorks) {
        expect(await run()).toBe('cookie')
      } else {
        await expect(run()).rejects.toBe(nativeError)
        expect(isGatewayAuthRejection(nativeError)).toBe(false)
      }
    }
  }

  let cookieCalls = 0
  await expect(
    requestWithOauthFallback('https://gw.test', {
      ensureNativeAccessToken: async () => {
        throw new NativeAuthChangedError()
      },
      requestWithBearer: async () => 'bearer',
      requestWithCookie: async () => {
        cookieCalls++

        return 'cookie'
      }
    })
  ).rejects.toThrow('Authentication changed')
  expect(cookieCalls).toBe(0)
})

test('ticket mints force one rotation on bearer 401; ordinary requests never replay a mutation', async () => {
  for (const status of [401, 403, 503]) {
    for (const rotated of ['fresh', null, 'transient'] as const) {
      const calls: unknown[] = []
      let refreshes = 0

      const run = () =>
        mintGatewayWsTicket(
          'https://gw.test',
          {
            ensureNativeAccessToken: async (_host, options) => {
              if (!options?.forceRefresh) {
                return 'old'
              }

              expect(options.rejectedAccessToken).toBe('old')
              refreshes++

              if (rotated === 'transient') {
                throw new Error('refresh timeout')
              }

              return rotated
            },
            fetchJson: async (_url, _token, options) => {
              calls.push(options.bearer)
              expect(options.headers).toEqual({ 'x-proxy': 'test' })

              if (options.bearer === 'old') {
                throw httpStatusError(status, 'rejected')
              }

              return { ticket: 'ticket' }
            },
            fetchJsonViaOauthSession: async () => {
              throw httpStatusError(401, 'no cookie')
            }
          },
          { 'x-proxy': 'test' }
        )

      if (status === 401 && rotated === 'fresh') {
        expect(await run()).toBe('ticket')
      } else {
        await expect(run()).rejects.toThrow(status === 401 && rotated === 'transient' ? 'refresh timeout' : 'rejected')
      }

      expect(refreshes).toBe(status === 401 ? 1 : 0)
      expect(calls).toEqual(status === 401 && rotated === 'fresh' ? ['old', 'fresh'] : ['old'])
    }
  }

  for (const error of [httpStatusError(401, 'rejected'), new Error('socket reset after body sent')]) {
    let submissions = 0
    let cookies = 0
    await expect(
      requestWithOauthFallback('https://gw.test', {
        ensureNativeAccessToken: async () => 'live',
        requestWithBearer: async () => {
          submissions++
          throw error
        },
        requestWithCookie: async () => {
          cookies++

          return 'duplicate mutation'
        }
      })
    ).rejects.toBe(error)
    expect(submissions).toBe(1)
    expect(cookies).toBe(0)
  }
})
