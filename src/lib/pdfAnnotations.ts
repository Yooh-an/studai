export type AnnotationTool = 'select' | 'pen' | 'highlighter' | 'underline' | 'eraser';
export type DrawableAnnotationTool = Exclude<AnnotationTool, 'select' | 'eraser'>;
export type BlendMode = 'normal' | 'multiply';
export type AnnotationSource = 'freehand' | 'selection';

export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface AnnotationStroke {
  id: string;
  pageNumber: number;
  tool: DrawableAnnotationTool;
  source?: AnnotationSource;
  color: string;
  size: number;
  opacity: number;
  blendMode: BlendMode;
  points: AnnotationPoint[];
}

export interface StrokeVisuals {
  color: string;
  opacity: number;
  width: number;
  blendMode: BlendMode;
}

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function normalizePoint(point: AnnotationPoint): AnnotationPoint {
  return {
    x: clamp(point.x),
    y: clamp(point.y),
  };
}

export function getStrokeVisuals(tool: DrawableAnnotationTool, color: string, size: number): StrokeVisuals {
  switch (tool) {
    case 'highlighter':
      return {
        color,
        opacity: 0.28,
        width: size * 2.4,
        blendMode: 'multiply',
      };
    case 'underline':
      return {
        color,
        opacity: 0.95,
        width: Math.max(2, size * 0.9),
        blendMode: 'normal',
      };
    case 'pen':
    default:
      return {
        color,
        opacity: 0.95,
        width: size,
        blendMode: 'normal',
      };
  }
}

export function buildStroke({
  pageNumber,
  tool,
  color,
  size,
  point,
  source = 'freehand',
}: {
  pageNumber: number;
  tool: DrawableAnnotationTool;
  color: string;
  size: number;
  point: AnnotationPoint;
  source?: AnnotationSource;
}): AnnotationStroke {
  const visuals = getStrokeVisuals(tool, color, size);

  return {
    id: `${pageNumber}-${tool}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pageNumber,
    tool,
    source,
    color: visuals.color,
    size: visuals.width,
    opacity: visuals.opacity,
    blendMode: visuals.blendMode,
    points: [normalizePoint(point)],
  };
}

export function updateStrokeWithPoint(stroke: AnnotationStroke, point: AnnotationPoint): AnnotationStroke {
  const normalizedPoint = normalizePoint(point);

  if (stroke.tool === 'underline') {
    return {
      ...stroke,
      points: [stroke.points[0], normalizedPoint],
    };
  }

  return {
    ...stroke,
    points: [...stroke.points, normalizedPoint],
  };
}

function toPixels(point: AnnotationPoint, pageSize: { width: number; height: number }) {
  return {
    x: point.x * pageSize.width,
    y: point.y * pageSize.height,
  };
}

function pointToSegmentDistance(
  point: AnnotationPoint,
  segmentStart: AnnotationPoint,
  segmentEnd: AnnotationPoint,
): number {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - segmentStart.x, point.y - segmentStart.y);
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / (dx * dx + dy * dy)),
  );

  const projection = {
    x: segmentStart.x + t * dx,
    y: segmentStart.y + t * dy,
  };

  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function clipViewportRectToPage(rect: ViewportRect, pageRect: ViewportRect): ViewportRect | null {
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
    return null;
  }

  const left = Math.max(rect.left, pageRect.left);
  const top = Math.max(rect.top, pageRect.top);
  const right = Math.min(rect.left + rect.width, pageRect.left + pageRect.width);
  const bottom = Math.min(rect.top + rect.height, pageRect.top + pageRect.height);

  if (right <= left || bottom <= top || pageRect.width <= 0 || pageRect.height <= 0) {
    return null;
  }

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function toPageRelativeRect(rect: ViewportRect, pageRect: ViewportRect): ViewportRect {
  return {
    left: rect.left - pageRect.left,
    top: rect.top - pageRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function getStrokeBounds(stroke: AnnotationStroke, pageSize: { width: number; height: number }) {
  if (stroke.points.length === 0) return null;

  const pixelPoints = stroke.points.map((point) => toPixels(point, pageSize));
  const xs = pixelPoints.map((point) => point.x);
  const ys = pixelPoints.map((point) => point.y);
  const radius = stroke.size / 2;

  return {
    left: Math.min(...xs) - radius,
    top: Math.min(...ys) - radius,
    right: Math.max(...xs) + radius,
    bottom: Math.max(...ys) + radius,
  };
}

function intersectsRect(
  strokeBounds: NonNullable<ReturnType<typeof getStrokeBounds>>,
  selectionRect: ViewportRect,
): boolean {
  return !(
    strokeBounds.right < selectionRect.left ||
    strokeBounds.left > selectionRect.left + selectionRect.width ||
    strokeBounds.bottom < selectionRect.top ||
    strokeBounds.top > selectionRect.top + selectionRect.height
  );
}

export function buildSelectionHighlightStrokes({
  pageNumber,
  color,
  selectionRects,
  pageRect,
}: {
  pageNumber: number;
  color: string;
  selectionRects: ViewportRect[];
  pageRect: ViewportRect;
}): AnnotationStroke[] {
  return selectionRects
    .map((rect) => clipViewportRectToPage(rect, pageRect))
    .filter((rect): rect is ViewportRect => rect !== null)
    .map((rect) => {
      const centerY = rect.top + rect.height / 2;
      const startPoint = {
        x: (rect.left - pageRect.left) / pageRect.width,
        y: (centerY - pageRect.top) / pageRect.height,
      };
      const endPoint = {
        x: (rect.left + rect.width - pageRect.left) / pageRect.width,
        y: startPoint.y,
      };

      return updateStrokeWithPoint(
        buildStroke({
          pageNumber,
          tool: 'highlighter',
          color,
          size: Math.max(2, rect.height / 2.4),
          point: startPoint,
          source: 'selection',
        }),
        endPoint,
      );
    });
}

export function isPointNearStroke({
  stroke,
  point,
  pageSize,
}: {
  stroke: AnnotationStroke;
  point: AnnotationPoint;
  pageSize: { width: number; height: number };
}): boolean {
  if (stroke.points.length === 0) return false;

  const pixelPoint = toPixels(point, pageSize);
  const threshold = Math.max(10, stroke.size * 1.2);

  if (stroke.points.length === 1) {
    const start = toPixels(stroke.points[0], pageSize);
    return Math.hypot(pixelPoint.x - start.x, pixelPoint.y - start.y) <= threshold;
  }

  for (let index = 1; index < stroke.points.length; index += 1) {
    const start = toPixels(stroke.points[index - 1], pageSize);
    const end = toPixels(stroke.points[index], pageSize);

    if (pointToSegmentDistance(pixelPoint, start, end) <= threshold) {
      return true;
    }
  }

  return false;
}

export function eraseStrokeAtPoint({
  strokes,
  point,
  pageNumber,
  pageSize,
}: {
  strokes: AnnotationStroke[];
  point: AnnotationPoint;
  pageNumber: number;
  pageSize: { width: number; height: number };
}): AnnotationStroke[] {
  const hitIndex = [...strokes]
    .map((stroke, index) => ({ stroke, index }))
    .reverse()
    .find(({ stroke }) => stroke.pageNumber === pageNumber && isPointNearStroke({ stroke, point, pageSize }))?.index;

  if (hitIndex === undefined) {
    return strokes;
  }

  return strokes.filter((_, index) => index !== hitIndex);
}

export function removeSelectionHighlightStrokes({
  strokes,
  pageNumber,
  selectionRects,
  pageRect,
}: {
  strokes: AnnotationStroke[];
  pageNumber: number;
  selectionRects: ViewportRect[];
  pageRect: ViewportRect;
}): AnnotationStroke[] {
  const clippedSelectionRects = selectionRects
    .map((rect) => clipViewportRectToPage(rect, pageRect))
    .filter((rect): rect is ViewportRect => rect !== null)
    .map((rect) => toPageRelativeRect(rect, pageRect));

  if (clippedSelectionRects.length === 0) {
    return strokes;
  }

  return strokes.filter((stroke) => {
    if (stroke.pageNumber !== pageNumber || stroke.tool !== 'highlighter' || stroke.source !== 'selection') {
      return true;
    }

    const bounds = getStrokeBounds(stroke, { width: pageRect.width, height: pageRect.height });
    if (!bounds) return true;

    return !clippedSelectionRects.some((selectionRect) => intersectsRect(bounds, selectionRect));
  });
}

export function strokeToSvgPath(stroke: AnnotationStroke, pageSize: { width: number; height: number }): string {
  const points = stroke.points.map((point) => toPixels(point, pageSize));

  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}
