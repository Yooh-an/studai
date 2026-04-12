export interface PdfPageReference {
  kind: 'current' | 'single' | 'range';
  startPage: number;
  endPage: number;
  label: string;
}

const CURRENT_PAGE_PATTERNS = [
  /현재\s*(보고\s*있는\s*)?(페이지|쪽)/i,
  /지금\s*(보고\s*있는\s*)?(페이지|쪽)/i,
  /이\s*페이지/i,
  /this\s+page/i,
  /current\s+page/i,
];

const RANGE_PATTERNS = [
  /(\d{1,4})\s*(?:-|~|–|—|to)\s*(\d{1,4})\s*(?:페이지|쪽|p(?:age)?\.?)/i,
  /(?:페이지|page|p\.?)\s*(\d{1,4})\s*(?:-|~|–|—|to)\s*(\d{1,4})\b/i,
  /(\d{1,4})\s*(?:페이지|쪽|p(?:age)?\.?)\s*부터\s*(\d{1,4})\s*(?:페이지|쪽|p(?:age)?\.?)/i,
];

const SINGLE_PAGE_PATTERNS = [
  /(?:페이지|page|p\.?)\s*(\d{1,4})\b/i,
  /(\d{1,4})\s*(?:페이지|쪽)/i,
  /\bp\.?\s*(\d{1,4})\b/i,
  /\b(\d{1,4})p\b/i,
];

function buildReference(kind: PdfPageReference['kind'], startPage: number, endPage = startPage): PdfPageReference {
  const normalizedStart = Math.min(startPage, endPage);
  const normalizedEnd = Math.max(startPage, endPage);

  return {
    kind,
    startPage: normalizedStart,
    endPage: normalizedEnd,
    label:
      normalizedStart === normalizedEnd
        ? `${normalizedStart}페이지`
        : `${normalizedStart}-${normalizedEnd}페이지`,
  };
}

export function parsePdfPageReference(input: string, currentPage?: number | null): PdfPageReference | null {
  const normalizedInput = input.trim();
  if (!normalizedInput) return null;

  for (const pattern of RANGE_PATTERNS) {
    const match = normalizedInput.match(pattern);
    if (!match) continue;

    const startPage = Number(match[1]);
    const endPage = Number(match[2]);
    if (Number.isFinite(startPage) && Number.isFinite(endPage) && startPage > 0 && endPage > 0) {
      return buildReference('range', startPage, endPage);
    }
  }

  for (const pattern of SINGLE_PAGE_PATTERNS) {
    const match = normalizedInput.match(pattern);
    if (!match) continue;

    const pageNumber = Number(match[1]);
    if (Number.isFinite(pageNumber) && pageNumber > 0) {
      return buildReference('single', pageNumber);
    }
  }

  if (typeof currentPage === 'number' && currentPage > 0) {
    for (const pattern of CURRENT_PAGE_PATTERNS) {
      if (pattern.test(normalizedInput)) {
        return buildReference('current', currentPage);
      }
    }
  }

  return null;
}

export function getPdfPageReferenceCount(reference: PdfPageReference) {
  return reference.endPage - reference.startPage + 1;
}
