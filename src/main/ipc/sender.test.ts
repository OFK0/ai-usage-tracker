// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isTrustedRendererUrl } from './sender'

const DEV_SERVER = 'http://localhost:5173'

describe('isTrustedRendererUrl', () => {
  it('trusts the packaged renderer loaded from disk', () => {
    expect(isTrustedRendererUrl('file:///C:/app/out/renderer/index.html')).toBe(true)
  })

  it('trusts the dev server origin during development', () => {
    expect(isTrustedRendererUrl('http://localhost:5173/', DEV_SERVER)).toBe(true)
    expect(isTrustedRendererUrl('http://localhost:5173/settings#general', DEV_SERVER)).toBe(true)
  })

  it('does not trust the dev server origin in a packaged build', () => {
    expect(isTrustedRendererUrl('http://localhost:5173/')).toBe(false)
  })

  it('does not trust a different port on the same host', () => {
    expect(isTrustedRendererUrl('http://localhost:8080/', DEV_SERVER)).toBe(false)
  })

  it('does not trust remote pages', () => {
    expect(isTrustedRendererUrl('https://example.com/', DEV_SERVER)).toBe(false)
  })

  it('does not trust a frame without a usable URL', () => {
    expect(isTrustedRendererUrl('')).toBe(false)
    expect(isTrustedRendererUrl('about:blank', DEV_SERVER)).toBe(false)
  })
})
