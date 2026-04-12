import assert from 'node:assert/strict';
import test from 'node:test';

import { getPageNumberForPdfNamedAction } from './pdfNamedActions';

test('getPageNumberForPdfNamedAction resolves basic page navigation actions', () => {
  assert.equal(getPageNumberForPdfNamedAction('NextPage', 3, 10), 4);
  assert.equal(getPageNumberForPdfNamedAction('PrevPage', 3, 10), 2);
  assert.equal(getPageNumberForPdfNamedAction('FirstPage', 3, 10), 1);
  assert.equal(getPageNumberForPdfNamedAction('LastPage', 3, 10), 10);
});

test('getPageNumberForPdfNamedAction clamps page navigation at document bounds', () => {
  assert.equal(getPageNumberForPdfNamedAction('PrevPage', 1, 10), 1);
  assert.equal(getPageNumberForPdfNamedAction('NextPage', 10, 10), 10);
});

test('getPageNumberForPdfNamedAction returns null for unsupported or invalid actions', () => {
  assert.equal(getPageNumberForPdfNamedAction('GoBack', 4, 10), null);
  assert.equal(getPageNumberForPdfNamedAction('CustomAction', 4, 10), null);
  assert.equal(getPageNumberForPdfNamedAction('NextPage', 4, 0), null);
});
