import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CHAT_API_URL,
  buildBridgeHealthUrl,
  buildBridgeModelsUrl,
  sanitizeBridgeUrl,
  writeStoredBridgeUrl,
} from './bridgePreferences';

function mockWindowWithStorage(initialEntries: Record<string, string> = {}) {
  const storage = new Map(Object.entries(initialEntries));
  const localStorage = {
    getItem(key: string) {
      return storage.has(key) ? storage.get(key)! : null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    },
  };

  const dispatchedEvents: Event[] = [];

  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage,
      dispatchEvent(event: Event) {
        dispatchedEvents.push(event);
        return true;
      },
    },
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, 'CustomEvent', {
    value: class CustomEvent<T = unknown> extends Event {
      detail: T;

      constructor(type: string, init?: CustomEventInit<T>) {
        super(type);
        this.detail = init?.detail as T;
      }
    },
    configurable: true,
    writable: true,
  });

  return { storage, dispatchedEvents };
}

test('sanitizeBridgeUrl migrates the legacy localhost bridge URL to the same-origin default', () => {
  assert.equal(sanitizeBridgeUrl('http://localhost:8787/api/chat'), DEFAULT_CHAT_API_URL);
  assert.equal(sanitizeBridgeUrl('http://127.0.0.1:8787/api/chat'), DEFAULT_CHAT_API_URL);
  assert.equal(sanitizeBridgeUrl(undefined), DEFAULT_CHAT_API_URL);
  assert.equal(sanitizeBridgeUrl(' https://bridge.example.com/api/chat/ '), 'https://bridge.example.com/api/chat');
});

test('buildBridgeHealthUrl and buildBridgeModelsUrl work with relative and absolute chat URLs', () => {
  assert.equal(buildBridgeHealthUrl('/api/chat'), '/health');
  assert.equal(buildBridgeModelsUrl('/api/chat'), '/api/models');
  assert.equal(buildBridgeHealthUrl('https://bridge.example.com/api/chat'), 'https://bridge.example.com/health');
  assert.equal(buildBridgeModelsUrl('https://bridge.example.com/api/chat'), 'https://bridge.example.com/api/models');
});

test('writeStoredBridgeUrl stores the normalized same-origin URL', () => {
  const { storage, dispatchedEvents } = mockWindowWithStorage();

  const next = writeStoredBridgeUrl('http://localhost:8787/api/chat');

  assert.equal(next, DEFAULT_CHAT_API_URL);
  assert.equal(storage.get('studai-chat-api-url'), DEFAULT_CHAT_API_URL);
  assert.equal(dispatchedEvents.length, 1);

  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'CustomEvent');
});
