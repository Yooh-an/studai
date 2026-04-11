export type AnnotationTool = 'select' | 'pen' | 'highlighter' | 'underline' | 'eraser';
export type DrawableAnnotationTool = Exclude<AnnotationTool, 'select' | 'eraser'>;
export type BlendMode = 'normal' | 'multiply';

export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface AnnotationStroke {
  id: string;
  pageNumber: number;
  tool: DrawableAnnotationTool;
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
}: {
  pageNumber: number;
  tool: DrawableAnnotationTool;
  color: string;
  size: number;
  point: AnnotationPoint;
}): AnnotationStroke {
  const visuals = getStrokeVisuals(tool, color, size);

  return {
    id: `${pageNumber}-${tool}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pageNumber,
    tool,
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

export function strokeToSvgPath(stroke: AnnotationStroke, pageSize: { width: number; height: number }): string {
  const points = stroke.points.map((point) => toPixels(point, pageSize));

  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}
