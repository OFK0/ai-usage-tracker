import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { ServerEndpoint } from './discovery'

const SERVICE = '/exa.language_server_pb.LanguageServerService'
const TIMEOUT_MS = 5_000

export interface LoopbackResponse {
  status: number
  body: unknown
}

/**
 * Calls one method of Antigravity's language server over the Connect protocol:
 * a JSON POST with its CSRF token. The host is always 127.0.0.1, which is why
 * the server's self-signed certificate is accepted here and nowhere else.
 * Node's own client does this; Chromium's network stack would refuse the
 * certificate.
 */
export function callLanguageServer(
  endpoint: ServerEndpoint,
  method: string,
  payload: object,
  signal?: AbortSignal
): Promise<LoopbackResponse> {
  const data = JSON.stringify(payload)
  const options = {
    hostname: '127.0.0.1',
    port: endpoint.port,
    path: `${SERVICE}/${method}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'Connect-Protocol-Version': '1',
      'X-Codeium-Csrf-Token': endpoint.csrfToken
    },
    timeout: TIMEOUT_MS,
    signal
  }

  return new Promise((resolve, reject) => {
    const onResponse = (response: import('node:http').IncomingMessage): void => {
      let text = ''
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => (text += chunk))
      response.on('end', () => {
        let body: unknown = null
        try {
          body = JSON.parse(text)
        } catch {
          // Left as null: the caller decides what a non-JSON answer means.
        }
        resolve({ status: response.statusCode ?? 0, body })
      })
    }

    const req =
      endpoint.scheme === 'https'
        ? httpsRequest({ ...options, rejectUnauthorized: false }, onResponse)
        : httpRequest(options, onResponse)
    req.on('timeout', () => req.destroy(new Error('Timed out')))
    req.on('error', reject)
    req.end(data)
  })
}

/** Whether an endpoint is the language server: its feature-flag call answers in JSON. */
export async function probeLanguageServer(endpoint: ServerEndpoint): Promise<boolean> {
  try {
    const { status, body } = await callLanguageServer(endpoint, 'GetUnleashData', {
      wrapper_data: {}
    })
    return status === 200 && body !== null
  } catch {
    return false
  }
}
