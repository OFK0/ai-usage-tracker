// @vitest-environment node
import { createInstance } from 'i18next'
import { describe, expect, it, vi } from 'vitest'
import { i18nOptions } from '@shared/i18n/resources'
import type { Language } from '@shared/settings'
import { trayMenuTemplate } from './menu'

async function labels(language: Language, widgetVisible: boolean): Promise<string[]> {
  const i18n = createInstance()
  await i18n.init(i18nOptions(language))
  return trayMenuTemplate({
    t: i18n.t,
    widgetVisible,
    toggleWidget: vi.fn(),
    refresh: vi.fn(),
    openSettings: vi.fn()
  }).flatMap((item) => (item.label ? [item.label] : []))
}

describe('trayMenuTemplate', () => {
  it('offers to show the widget while it is hidden, and to hide it while it shows', async () => {
    expect((await labels('en', false))[0]).toBe('Show widget')
    expect((await labels('en', true))[0]).toBe('Hide widget')
  })

  it('is in the language the app is in', async () => {
    expect(await labels('tr', true)).toEqual(["Widget'ı gizle", 'Yenile', 'Ayarlar…', 'Çık'])
  })

  it('runs the matching action for each item', () => {
    const actions = { toggleWidget: vi.fn(), refresh: vi.fn(), openSettings: vi.fn() }
    const items = trayMenuTemplate({
      t: ((key: string) => key) as never,
      widgetVisible: false,
      ...actions
    })

    for (const item of items) item.click?.(undefined as never, undefined, undefined as never)

    expect(actions.toggleWidget).toHaveBeenCalledOnce()
    expect(actions.refresh).toHaveBeenCalledOnce()
    expect(actions.openSettings).toHaveBeenCalledOnce()
  })
})
