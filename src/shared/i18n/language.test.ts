import { describe, expect, it } from 'vitest'
import { localeArguments, parseLocaleArguments, resolveLanguage, textDirection } from './language'

describe('resolveLanguage', () => {
  it('uses the language the user picked', () => {
    expect(resolveLanguage('fr', ['de-DE'])).toBe('fr')
  })

  it('follows the system, matching on the language alone', () => {
    expect(resolveLanguage('system', ['tr-TR', 'en-US'])).toBe('tr')
    expect(resolveLanguage('system', ['de_AT'])).toBe('de')
  })

  it('skips system languages the app does not have', () => {
    expect(resolveLanguage('system', ['es-ES', 'it-IT'])).toBe('it')
  })

  it('falls back to English', () => {
    expect(resolveLanguage('system', ['ja-JP'])).toBe('en')
    expect(resolveLanguage('system', [])).toBe('en')
  })
})

describe('textDirection', () => {
  it('is right to left for Arabic only', () => {
    expect(textDirection('ar')).toBe('rtl')
    expect(textDirection('ru')).toBe('ltr')
  })
})

describe('locale arguments', () => {
  it('round-trips through the command line', () => {
    const locale = { language: 'tr' as const, systemLanguages: ['tr-TR', 'en-US'] }

    expect(parseLocaleArguments(['electron', ...localeArguments(locale)])).toEqual(locale)
  })

  it('falls back to English without them', () => {
    expect(parseLocaleArguments(['electron'])).toEqual({ language: 'en', systemLanguages: [] })
  })

  it('drops anything that is not a language tag', () => {
    const argv = ['--ait-language=xx', '--ait-system-languages=en-US,<script>,']

    expect(parseLocaleArguments(argv)).toEqual({ language: 'en', systemLanguages: ['en-US'] })
  })
})
