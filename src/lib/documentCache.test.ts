import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCachedPdfScale, saveCachedPdfScale } from './documentCache';

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
    value: { localStorage },
    configurable: true,
    writable: true,
  });

  return storage;
}

test('saveCachedPdfScale persists a normalized zoom level and loadCachedPdfScale restores it', () => {
  const storage = mockWindowWithStorage();

  saveCachedPdfScale('sample-doc', 1.26);

  assert.equal(loadCachedPdfScale('sample-doc'), 1.3);
  assert.equal(storage.get('studai:cache:v1:pdf-scale:sample-doc'), '1.3');

  Reflect.deleteProperty(globalThis, 'window');
});

test('loadCachedPdfScale ignores invalid cached zoom values', () => {
  mockWindowWithStorage({
    'studai:cache:v1:pdf-scale:too-small': JSON.stringify(0.2),
    'studai:cache:v1:pdf-scale:too-large': JSON.stringify(4),
    'studai:cache:v1:pdf-scale:not-a-number': JSON.stringify('abc'),
  });

  assert.equal(loadCachedPdfScale('too-small'), null);
  assert.equal(loadCachedPdfScale('too-large'), null);
  assert.equal(loadCachedPdfScale('not-a-number'), null);

  Reflect.deleteProperty(globalThis, 'window');
});
