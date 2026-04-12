import assert from 'node:assert/strict';
import test from 'node:test';

import { getPdfPageReferenceCount, parsePdfPageReference } from './pdfPageRequests';

test('parsePdfPageReference resolves current-page phrases with the viewer page number', () => {
  const reference = parsePdfPageReference('현재 페이지 설명해줘', 7);

  assert.deepEqual(reference, {
    kind: 'current',
    startPage: 7,
    endPage: 7,
    label: '7페이지',
  });
});

test('parsePdfPageReference resolves explicit single-page references', () => {
  const reference = parsePdfPageReference('15페이지 핵심만 정리해줘', 3);

  assert.deepEqual(reference, {
    kind: 'single',
    startPage: 15,
    endPage: 15,
    label: '15페이지',
  });
});

test('parsePdfPageReference resolves explicit page ranges', () => {
  const reference = parsePdfPageReference('10~12페이지 내용을 요약해줘', 3);

  assert.deepEqual(reference, {
    kind: 'range',
    startPage: 10,
    endPage: 12,
    label: '10-12페이지',
  });
  assert.equal(getPdfPageReferenceCount(reference!), 3);
});

test('parsePdfPageReference does not confuse figure numbers with page ranges', () => {
  const reference = parsePdfPageReference('지금 페이지에 그림 1-6 을 좀 이해하기 쉽게 설명해줘', 8);

  assert.deepEqual(reference, {
    kind: 'current',
    startPage: 8,
    endPage: 8,
    label: '8페이지',
  });
});
