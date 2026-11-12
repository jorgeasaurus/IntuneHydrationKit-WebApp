import '@testing-library/jest-dom'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './msw-handlers'

// Node 25 and later define their own localStorage and sessionStorage globals.
// Without --localstorage-file, these globals are undefined. The Vitest jsdom
// environment does not replace a global that already exists, so the tests get
// the Node value. Install the jsdom Storage objects on the global object.
const { jsdom } = globalThis as typeof globalThis & {
  jsdom?: { window: Window }
}
if (jsdom) {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      value: jsdom.window[name],
      writable: true,
    })
  }
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
