import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampPdfScale,
  getPdfScaleFromPinchGesture,
  isScrollAtGestureBoundary,
  normalizeWheelDelta,
} from './documentGestures';

test('clampPdfScale keeps zoom within supported bounds', () => {
  assert.equal(clampPdfScale(0.2), 0.5);
  assert.equal(clampPdfScale(1.234), 1.23);
  assert.equal(clampPdfScale(9), 3);
});

test('getPdfScaleFromPinchGesture zooms in on pinch-out and zooms out on pinch-in', () => {
  assert.ok(getPdfScaleFromPinchGesture(1, -20) > 1);
  assert.ok(getPdfScaleFromPinchGesture(1, 20) < 1);
});

test('normalizeWheelDelta converts line and page delta modes to pixels', () => {
  assert.equal(normalizeWheelDelta(10, 0, 800), 10);
  assert.equal(normalizeWheelDelta(2, 1, 800), 32);
  assert.equal(normalizeWheelDelta(1, 2, 800), 800);
});

test('isScrollAtGestureBoundary detects top and bottom edges of the render viewport', () => {
  assert.equal(
    isScrollAtGestureBoundary({
      scrollTop: 1,
      clientHeight: 600,
      scrollHeight: 1600,
      direction: -1,
    }),
    true,
  );

  assert.equal(
    isScrollAtGestureBoundary({
      scrollTop: 999,
      clientHeight: 600,
      scrollHeight: 1600,
      direction: 1,
    }),
    true,
  );

  assert.equal(
    isScrollAtGestureBoundary({
      scrollTop: 200,
      clientHeight: 600,
      scrollHeight: 1600,
      direction: 1,
    }),
    false,
  );
});
