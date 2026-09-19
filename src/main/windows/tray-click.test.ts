// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { trayClickAction } from './tray-click'

describe('trayClickAction', () => {
  it('shows a hidden widget', () => {
    expect(trayClickAction({ visible: false, focused: false, alwaysOnTop: true })).toBe('show')
  })

  it('hides a widget that floats on top', () => {
    expect(trayClickAction({ visible: true, focused: false, alwaysOnTop: true })).toBe('hide')
  })

  it('brings a widget buried under other windows to the front instead of hiding it', () => {
    expect(trayClickAction({ visible: true, focused: false, alwaysOnTop: false })).toBe('show')
  })

  it('hides a widget that is already in front', () => {
    expect(trayClickAction({ visible: true, focused: true, alwaysOnTop: false })).toBe('hide')
  })
})
