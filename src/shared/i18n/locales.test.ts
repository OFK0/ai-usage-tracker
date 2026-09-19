import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '../settings'
import { LOCALES } from './resources'

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

/** Flattens nested keys into dotted paths, keeping the string at each. */
function flatten(tree: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(path, value)
    else for (const [k, v] of flatten(value, path)) out.set(k, v)
  }
  return out
}

/** Plural forms share one key, whatever forms a language happens to need. */
function baseKeys(strings: Map<string, string>): Set<string> {
  return new Set([...strings.keys()].map((key) => key.replace(PLURAL_SUFFIX, '')))
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1] ?? '').sort()
}

const english = flatten(LOCALES.en)
const pluralKeys = new Set(
  [...english.keys()]
    .filter((key) => PLURAL_SUFFIX.test(key))
    .map((key) => key.replace(PLURAL_SUFFIX, ''))
)

describe.each(LANGUAGES.filter((language) => language !== 'en'))('%s', (language) => {
  const strings = flatten(LOCALES[language])

  it('has every key English has, and no others', () => {
    expect([...baseKeys(strings)].sort()).toEqual([...baseKeys(english)].sort())
  })

  it('has every plural form the language needs', () => {
    const categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories
    for (const key of pluralKeys) {
      for (const category of categories) {
        expect(strings.has(`${key}_${category}`), `${key}_${category}`).toBe(true)
      }
    }
  })

  it('keeps the placeholders of each string', () => {
    for (const [key, text] of strings) {
      const base = key.replace(PLURAL_SUFFIX, '')
      const source = english.get(key) ?? english.get(`${base}_other`) ?? ''
      // A plural form may spell its number out ("two messages"), so the count can go.
      const drop = (names: string[]): string[] =>
        PLURAL_SUFFIX.test(key) ? names.filter((name) => name !== 'count') : names
      expect(drop(placeholders(text)), key).toEqual(drop(placeholders(source)))
    }
  })

  it('leaves nothing empty', () => {
    for (const [key, text] of strings) expect(text.trim(), key).not.toBe('')
  })
})
