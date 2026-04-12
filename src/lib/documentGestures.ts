export const MIN_PDF_SCALE = 0.5;
export const MAX_PDF_SCALE = 3;
const LINE_HEIGHT_IN_PIXELS = 16;
const EDGE_TOLERANCE_IN_PIXELS = 2;

export function clampPdfScale(scale: number) {
  return Math.min(MAX_PDF_SCALE, Math.max(MIN_PDF_SCALE, Math.round(scale * 100) / 100));
}

export function getPdfScaleFromPinchGesture(currentScale: number, deltaY: number) {
  return clampPdfScale(currentScale * Math.exp(-deltaY * 0.01));
}

export function normalizeWheelDelta(delta: number, deltaMode: number, pageHeight: number) {
  switch (deltaMode) {
    case 1:
      return delta * LINE_HEIGHT_IN_PIXELS;
    case 2:
      return delta * pageHeight;
    case 0:
    default:
      return delta;
  }
}

export function isScrollAtGestureBoundary({
  scrollTop,
  clientHeight,
  scrollHeight,
  direction,
}: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  direction: -1 | 1;
}) {
  if (direction < 0) {
    return scrollTop <= EDGE_TOLERANCE_IN_PIXELS;
  }

  return scrollTop + clientHeight >= scrollHeight - EDGE_TOLERANCE_IN_PIXELS;
}
