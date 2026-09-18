// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { defaultSettings, type Settings } from '@shared/settings'
import { createSettingsRepository } from './settings-repository'

function backend(initial?: unknown): {
  read: () => unknown
  write: (settings: Settings) => void
  written: Settings[]
} {
  const written: Settings[] = []
  return {
    written,
    read: vi.fn(() => initial),
    write: (settings) => {
      written.push(settings)
    }
  }
}

describe('createSettingsRepository', () => {
  it('serves defaults before anything has been saved', () => {
    expect(createSettingsRepository(backend()).get()).toEqual(defaultSettings())
  })

  it('reads the backend once and serves later calls from memory', () => {
    const store = backend({ theme: 'dark' })
    const repository = createSettingsRepository(store)

    repository.get()
    repository.get()

    expect(store.read).toHaveBeenCalledOnce()
  })

  it('writes the full merged settings on update', () => {
    const store = backend({ theme: 'dark' })
    const repository = createSettingsRepository(store)

    const next = repository.update({ opacity: 0.8 })

    expect(next.theme).toBe('dark')
    expect(next.opacity).toBe(0.8)
    expect(store.written).toEqual([next])
  })

  it('returns the updated settings from later reads', () => {
    const repository = createSettingsRepository(backend())

    repository.update({ language: 'tr' })

    expect(repository.get().language).toBe('tr')
  })

  it('tells listeners about each update until they unsubscribe', () => {
    const repository = createSettingsRepository(backend())
    const listener = vi.fn()

    const unsubscribe = repository.onChange(listener)
    repository.update({ theme: 'dark' })
    unsubscribe()
    repository.update({ theme: 'light' })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }))
  })
})
