import assert from 'node:assert/strict';
import test from 'node:test';

import { assessPdfTextDensity } from './pdfTextHeuristics';

test('assessPdfTextDensity treats sparse sampled text as likely image-only PDF', () => {
  const result = assessPdfTextDensity(['', '  ', '표 1', '그림'], 80);

  assert.equal(result.sampledPages, 4);
  assert.equal(result.likelyImageOnly, true);
  assert.equal(Math.round(result.averageCharsPerSampledPage), 1);
});

test('assessPdfTextDensity treats rich sampled text as text PDF', () => {
  const result = assessPdfTextDensity([
    '이 페이지에는 충분한 본문 텍스트가 들어 있습니다. '.repeat(8),
    '두 번째 페이지도 비슷한 분량의 텍스트를 포함합니다. '.repeat(8),
  ], 80);

  assert.equal(result.sampledPages, 2);
  assert.equal(result.likelyImageOnly, false);
  assert.ok(result.averageCharsPerSampledPage > 80);
});
