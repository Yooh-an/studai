import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readStoredCodexReasoningPreference,
  readStoredUseFastModel,
  writeStoredCodexReasoningPreference,
  writeStoredUseFastModel,
} from './providerPreferences';

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

  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage,
      dispatchEvent() {
        return true;
      },
    },
    configurable: true,
    writable: true,
  });

  return storage;
}

test('codex reasoning preference persists and reloads', () => {
  const storage = mockWindowWithStorage();

  writeStoredCodexReasoningPreference('high');

  assert.equal(readStoredCodexReasoningPreference(), 'high');
  assert.equal(storage.get('studai-codex-reasoning-preference'), 'high');

  Reflect.deleteProperty(globalThis, 'window');
});

test('fast model preference persists and reloads', () => {
  const storage = mockWindowWithStorage();

  writeStoredUseFastModel(true);

  assert.equal(readStoredUseFastModel(), true);
  assert.equal(storage.get('studai-use-fast-model'), 'true');

  Reflect.deleteProperty(globalThis, 'window');
});
