import 'i18next'
import type en from './locales/en.json'

// English is the source every other locale follows, so its keys are the ones
// t() accepts: a typo in a key fails the typecheck instead of showing the key.
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en }
  }
}
