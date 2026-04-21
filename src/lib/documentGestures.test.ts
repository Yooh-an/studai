import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampPdfScale,
  getBoundaryCaptureScrollTop,
  getBoundaryPageTurnIntent,
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

test('getBoundaryPageTurnIntent blocks the first boundary scroll and turns on the next gesture', () => {
  const firstAttempt = getBoundaryPageTurnIntent({
    prime: null,
    pageNumber: 3,
    direction: 1,
    isNewGesture: true,
  });

  assert.equal(firstAttempt.shouldTurnPage, false);
  assert.deepEqual(firstAttempt.nextPrime, { pageNumber: 3, direction: 1 });

  const continuedGesture = getBoundaryPageTurnIntent({
    prime: firstAttempt.nextPrime,
    pageNumber: 3,
    direction: 1,
    isNewGesture: false,
  });

  assert.equal(continuedGesture.shouldTurnPage, false);
  assert.deepEqual(continuedGesture.nextPrime, { pageNumber: 3, direction: 1 });

  const secondAttempt = getBoundaryPageTurnIntent({
    prime: continuedGesture.nextPrime,
    pageNumber: 3,
    direction: 1,
    isNewGesture: true,
  });

  assert.equal(secondAttempt.shouldTurnPage, true);
  assert.deepEqual(secondAttempt.nextPrime, { pageNumber: 3, direction: 1 });
});

test('getBoundaryPageTurnIntent re-primes when the boundary direction or page changes', () => {
  const directionChange = getBoundaryPageTurnIntent({
    prime: { pageNumber: 3, direction: 1 },
    pageNumber: 3,
    direction: -1,
    isNewGesture: true,
  });

  assert.equal(directionChange.shouldTurnPage, false);
  assert.deepEqual(directionChange.nextPrime, { pageNumber: 3, direction: -1 });

  const pageChange = getBoundaryPageTurnIntent({
    prime: { pageNumber: 3, direction: 1 },
    pageNumber: 4,
    direction: 1,
    isNewGesture: true,
  });

  assert.equal(pageChange.shouldTurnPage, false);
  assert.deepEqual(pageChange.nextPrime, { pageNumber: 4, direction: 1 });
});

test('getBoundaryCaptureScrollTop captures a large downward wheel to the bottom boundary', () => {
  assert.equal(
    getBoundaryCaptureScrollTop({
      scrollTop: 700,
      clientHeight: 600,
      scrollHeight: 1600,
      deltaY: 500,
    }),
    1000,
  );
});

test('getBoundaryCaptureScrollTop captures a large upward wheel to the top boundary', () => {
  assert.equal(
    getBoundaryCaptureScrollTop({
      scrollTop: 250,
      clientHeight: 600,
      scrollHeight: 1600,
      deltaY: -400,
    }),
    0,
  );
});

test('getBoundaryCaptureScrollTop ignores wheels that do not reach a boundary', () => {
  assert.equal(
    getBoundaryCaptureScrollTop({
      scrollTop: 250,
      clientHeight: 600,
      scrollHeight: 1600,
      deltaY: 100,
    }),
    null,
  );
});
