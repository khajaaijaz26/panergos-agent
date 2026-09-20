import { randomBytes } from 'node:crypto'

/** Shared request-body helpers plus Electron OAuth-session header setup. */

function multipartBody(upload) {
  const boundary = `----panergos-${randomBytes(12).toString('hex')}`
  const filename = String(upload.filename || 'file').replace(/["\r\n]/g, '_')

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${upload.contentType || 'application/octet-stream'}\r\n\r\n`
    ),
    Buffer.from(upload.bytes),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ])

  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

function serializeJsonBody(body) {
  return body === undefined ? undefined : Buffer.from(JSON.stringify(body))
}

function setJsonRequestHeaders(request) {
  request.setHeader('Content-Type', 'application/json')
}

export { multipartBody, serializeJsonBody, setJsonRequestHeaders }
