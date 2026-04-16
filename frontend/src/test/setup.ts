import '@testing-library/jest-dom'
import { setupServer } from 'msw/node'
import { handlers } from '../mocks/handlers'

// Set up MSW server for all tests
export const server = setupServer(...handlers)

// In Node.js 25+, importing msw/node triggers a module-level access to
// globalThis.localStorage via Node's native webstorage getter, which replaces
// the jsdom-provided localStorage with a native Node object that lacks .clear().
// Restore a proper in-memory Storage implementation before each test so that
// localStorage.clear(), getItem(), setItem(), and removeItem() all work, and
// vi.spyOn(Storage.prototype, ...) intercepts calls correctly.
//
// The object is created with Storage.prototype in its prototype chain so that
// spying on Storage.prototype methods intercepts calls as expected by tests.
function createInMemoryStorage(): Storage {
  let store: Record<string, string> = {}
  const storage = Object.create(Storage.prototype) as Storage
  Object.defineProperties(storage, {
    length: {
      get() {
        return Object.keys(store).length
      },
      configurable: true,
    },
    key: {
      value(index: number): string | null {
        return Object.keys(store)[index] ?? null
      },
      writable: true,
      configurable: true,
    },
    getItem: {
      value(key: string): string | null {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
      },
      writable: true,
      configurable: true,
    },
    setItem: {
      value(key: string, value: string): void {
        store[key] = String(value)
      },
      writable: true,
      configurable: true,
    },
    removeItem: {
      value(key: string): void {
        delete store[key]
      },
      writable: true,
      configurable: true,
    },
    clear: {
      value(): void {
        store = {}
      },
      writable: true,
      configurable: true,
    },
  })
  return storage
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createInMemoryStorage(),
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: createInMemoryStorage(),
    writable: true,
    configurable: true,
  })
})

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
