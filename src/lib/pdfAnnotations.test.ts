import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStroke,
  eraseStrokeAtPoint,
  getStrokeVisuals,
  updateStrokeWithPoint,
} from './pdfAnnotations';

test('buildStroke creates a page-bound stroke with normalized points', () => {
  const stroke = buildStroke({
    pageNumber: 2,
    tool: 'pen',
    color: '#2563eb',
    size: 4,
    point: { x: 0.25, y: 0.5 },
  });

  assert.equal(stroke.pageNumber, 2);
  assert.equal(stroke.tool, 'pen');
  assert.equal(stroke.points.length, 1);
  assert.deepEqual(stroke.points[0], { x: 0.25, y: 0.5 });
});

test('updateStrokeWithPoint appends freehand points and clamps them into bounds', () => {
  const stroke = buildStroke({
    pageNumber: 1,
    tool: 'highlighter',
    color: '#facc15',
    size: 12,
    point: { x: 0.2, y: 0.4 },
  });

  const updated = updateStrokeWithPoint(stroke, { x: 1.3, y: -1 });

  assert.equal(updated.points.length, 2);
  assert.deepEqual(updated.points[1], { x: 1, y: 0 });
});

test('updateStrokeWithPoint keeps underline strokes as a simple start/end segment', () => {
  const stroke = buildStroke({
    pageNumber: 1,
    tool: 'underline',
    color: '#ef4444',
    size: 6,
    point: { x: 0.1, y: 0.6 },
  });

  const updated = updateStrokeWithPoint(stroke, { x: 0.8, y: 0.62 });

  assert.equal(updated.points.length, 2);
  assert.deepEqual(updated.points[0], { x: 0.1, y: 0.6 });
  assert.deepEqual(updated.points[1], { x: 0.8, y: 0.62 });
});

test('getStrokeVisuals returns translucent multiply blend settings for highlighter strokes', () => {
  const visuals = getStrokeVisuals('highlighter', '#facc15', 10);

  assert.equal(visuals.color, '#facc15');
  assert.equal(visuals.blendMode, 'multiply');
  assert.ok(visuals.opacity < 0.5);
  assert.ok(visuals.width > 10);
});

test('eraseStrokeAtPoint removes only the touched stroke from the current page', () => {
  const untouched = buildStroke({
    pageNumber: 1,
    tool: 'pen',
    color: '#111827',
    size: 4,
    point: { x: 0.1, y: 0.1 },
  });

  const target = updateStrokeWithPoint(
    buildStroke({
      pageNumber: 1,
      tool: 'pen',
      color: '#111827',
      size: 4,
      point: { x: 0.45, y: 0.45 },
    }),
    { x: 0.55, y: 0.55 },
  );

  const otherPage = buildStroke({
    pageNumber: 2,
    tool: 'pen',
    color: '#111827',
    size: 4,
    point: { x: 0.5, y: 0.5 },
  });

  const remaining = eraseStrokeAtPoint({
    strokes: [untouched, target, otherPage],
    point: { x: 0.5, y: 0.5 },
    pageNumber: 1,
    pageSize: { width: 1000, height: 1400 },
  });

  assert.deepEqual(
    remaining.map((stroke) => stroke.id),
    [untouched.id, otherPage.id],
  );
});
