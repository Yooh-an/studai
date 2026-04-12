import type { ChatDocumentContext, ChatImageAttachment } from './chatApi';
import { renderPdfPageImages } from './pdfImages';
import { parsePdfPageReference } from './pdfPageRequests';
import { extractAllPdfPageText, extractPdfPageRangeText, getPdfPageCount, getPdfTextIndexMetadata } from './pdfText';

const DEFAULT_TOTAL_CONTEXT_CHARS = 14000;
const EXPLICIT_CONTEXT_MAX_PAGES = 12;
const EXPLICIT_IMAGE_MAX_PAGES = 3;
const SEARCH_RESULT_PAGE_LIMIT = 4;
const SEARCH_PAGE_EXCERPT_CHARS = 1400;
const EXPLICIT_MIN_PAGE_CHARS = 700;
const IMAGE_TEXT_THRESHOLD = 160;
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'into', 'about', 'what', 'which', 'when', 'where', 'have', 'has',
  '있는', '있는지', '대한', '대해', '관련', '설명', '분석', '요약', '정리', '내용', '문서', '페이지', '지금', '현재', '그림', '표',
  '좀', '더', '이해', '쉽게', '해줘', '해주세요', '알려줘', '말해줘', '부탁해', '주세요', '에서', '으로', '그리고', '또는',
]);

const CURRENT_PAGE_FOCUS_PATTERNS = [
  /현재\s*(보고\s*있는\s*)?(페이지|쪽)/i,
  /지금\s*(보고\s*있는\s*)?(페이지|쪽)/i,
  /이\s*(페이지|그림|표|도표|수식|식)/i,
  /this\s+(page|figure|table|equation)/i,
];

const SUMMARY_PATTERNS = [
  /요약/i,
  /정리/i,
  /핵심/i,
  /summary/i,
  /summari[sz]e/i,
  /outline/i,
];

const REFERENCE_PATTERNS = [
  /(그림|표|도표|수식|식)\s*\d+(?:\s*[-–—]\s*\d+)?/gi,
  /(figure|table|equation)\s*\d+(?:\s*[-–—]\s*\d+)?/gi,
];

export class PdfContextResolutionError extends Error {}

export interface ResolvedPdfQueryContext {
  documentContext?: ChatDocumentContext;
  images?: ChatImageAttachment[];
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function tokenize(text: string) {
  return unique(
    (text.toLowerCase().match(/[0-9a-zA-Z가-힣]+/g) || [])
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)),
  );
}

function extractReferences(text: string) {
  return unique(
    REFERENCE_PATTERNS.flatMap((pattern) => Array.from(text.matchAll(pattern)).map((match) => match[0].replace(/\s+/g, ' ').trim().toLowerCase())),
  );
}

function includesCurrentPageFocus(text: string) {
  return CURRENT_PAGE_FOCUS_PATTERNS.some((pattern) => pattern.test(text));
}

function isSummaryRequest(text: string) {
  return SUMMARY_PATTERNS.some((pattern) => pattern.test(text));
}

function buildExcerpt(text: string, queryTokens: string[], references: string[], maxChars: number) {
  const normalizedText = text.trim();
  if (!normalizedText) return '';
  if (normalizedText.length <= maxChars) return normalizedText;

  const lower = normalizedText.toLowerCase();
  const anchors = [
    ...references,
    ...queryTokens.filter((token) => token.length >= 2),
  ];

  let bestIndex = -1;
  for (const anchor of anchors) {
    const index = lower.indexOf(anchor.toLowerCase());
    if (index >= 0) {
      bestIndex = index;
      break;
    }
  }

  if (bestIndex < 0) {
    return `${normalizedText.slice(0, maxChars).trimEnd()}…`;
  }

  const half = Math.max(200, Math.floor(maxChars / 2));
  const start = Math.max(0, bestIndex - Math.floor(half * 0.4));
  const end = Math.min(normalizedText.length, start + maxChars);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < normalizedText.length ? '…' : '';
  return `${prefix}${normalizedText.slice(start, end).trim()}${suffix}`;
}

function scorePageText(text: string, queryTokens: string[], references: string[]) {
  const lower = text.toLowerCase();
  let score = 0;

  for (const reference of references) {
    if (lower.includes(reference.toLowerCase())) {
      score += 12;
    }
  }

  for (const token of queryTokens) {
    if (!lower.includes(token)) continue;
    score += token.length >= 4 ? 4 : 2;
  }

  return score;
}

function shouldAttachImages(params: {
  pageCount: number;
  pages: Array<{ text: string }>;
  references: string[];
  userText: string;
}) {
  const { pageCount, pages, references, userText } = params;
  if (pageCount > EXPLICIT_IMAGE_MAX_PAGES) return false;
  if (references.length > 0) return true;
  if (pages.some((page) => page.text.trim().length < IMAGE_TEXT_THRESHOLD)) return true;
  return /그림|표|도표|수식|식|figure|table|equation|diagram|chart|image/i.test(userText);
}

function buildDocumentContext(params: {
  currentPage?: number;
  totalPages?: number;
  focus?: string;
  pages: Array<{ pageNumber: number; text: string }>;
}): ChatDocumentContext | undefined {
  const pages = params.pages.filter((page) => page.text.trim().length > 0);
  if (pages.length === 0) return undefined;

  return {
    kind: 'pdf',
    currentPage: params.currentPage,
    totalPages: params.totalPages,
    focus: params.focus,
    pages,
  };
}

interface ResolvePdfDocumentContextOptions {
  file: File;
  userText: string;
  currentPage?: number | null;
  totalPages?: number | null;
}

export async function resolvePdfDocumentContext({
  file,
  userText,
  currentPage,
  totalPages,
}: ResolvePdfDocumentContextOptions): Promise<ResolvedPdfQueryContext | undefined> {
  const pageReference = parsePdfPageReference(userText, currentPage);
  const normalizedCurrentPage = typeof currentPage === 'number' && currentPage > 0 ? currentPage : undefined;
  const references = extractReferences(userText);
  const queryTokens = tokenize(userText);
  let preferredCurrentPageImages: ChatImageAttachment[] | undefined;

  if (pageReference) {
    const pageCount = pageReference.endPage - pageReference.startPage + 1;
    if (pageCount > EXPLICIT_CONTEXT_MAX_PAGES) {
      throw new PdfContextResolutionError('요청 범위가 너무 넓습니다. 페이지 범위를 조금만 더 좁혀주세요.');
    }

    const resolvedTotalPages = totalPages ?? await getPdfPageCount(file);
    if (pageReference.startPage < 1 || pageReference.endPage > resolvedTotalPages) {
      throw new PdfContextResolutionError(`요청한 페이지 번호를 확인해주세요. 이 문서는 ${resolvedTotalPages}페이지까지 있습니다.`);
    }

    const maxCharsPerPage = Math.max(
      EXPLICIT_MIN_PAGE_CHARS,
      Math.floor(DEFAULT_TOTAL_CONTEXT_CHARS / Math.max(1, pageCount)),
    );

    const { pages } = await extractPdfPageRangeText(file, pageReference.startPage, pageReference.endPage, {
      maxCharsPerPage,
    });

    const documentContext = buildDocumentContext({
      currentPage: normalizedCurrentPage,
      totalPages: resolvedTotalPages,
      focus: pageCount === 1 ? `${pageReference.startPage}페이지` : `${pageReference.startPage}-${pageReference.endPage}페이지`,
      pages: pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
      })),
    });

    const images = shouldAttachImages({ pageCount, pages, references, userText })
      ? await renderPdfPageImages(
          file,
          pages.slice(0, EXPLICIT_IMAGE_MAX_PAGES).map((page) => page.pageNumber),
          { maxWidth: 1280, mimeType: 'image/jpeg', quality: 0.82 },
        )
      : undefined;

    if (!documentContext && (!images || images.length === 0)) {
      throw new PdfContextResolutionError('해당 페이지를 읽지 못했습니다.');
    }

    return {
      documentContext,
      images,
    };
  }

  if (normalizedCurrentPage && includesCurrentPageFocus(userText)) {
    const { numPages, pages } = await extractPdfPageRangeText(file, normalizedCurrentPage, normalizedCurrentPage, {
      maxCharsPerPage: Math.floor(DEFAULT_TOTAL_CONTEXT_CHARS / 2),
    });

    const documentContext = buildDocumentContext({
      currentPage: normalizedCurrentPage,
      totalPages: totalPages ?? numPages,
      focus: '현재 페이지',
      pages: [{
        pageNumber: normalizedCurrentPage,
        text: pages[0]?.text || '',
      }],
    });

    const images = shouldAttachImages({ pageCount: 1, pages, references, userText })
      ? await renderPdfPageImages(file, [normalizedCurrentPage], { maxWidth: 1280, mimeType: 'image/jpeg', quality: 0.82 })
      : undefined;

    if (documentContext || (images && images.length > 0)) {
      return {
        documentContext,
        images,
      };
    }
  }

  if (normalizedCurrentPage && references.length > 0) {
    const { numPages, pages } = await extractPdfPageRangeText(file, normalizedCurrentPage, normalizedCurrentPage, {
      maxCharsPerPage: Math.floor(DEFAULT_TOTAL_CONTEXT_CHARS / 2),
    });

    preferredCurrentPageImages = await renderPdfPageImages(file, [normalizedCurrentPage], {
      maxWidth: 1280,
      mimeType: 'image/jpeg',
      quality: 0.82,
    });

    const currentPageText = pages[0]?.text || '';
    const currentPageScore = scorePageText(currentPageText, queryTokens, references);
    const currentPageContext = buildDocumentContext({
      currentPage: normalizedCurrentPage,
      totalPages: totalPages ?? numPages,
      focus: '현재 보고 있는 페이지',
      pages: [{
        pageNumber: normalizedCurrentPage,
        text: currentPageText,
      }],
    });

    if (currentPageScore > 0 || currentPageText.trim().length < IMAGE_TEXT_THRESHOLD) {
      return {
        documentContext: currentPageContext,
        images: preferredCurrentPageImages,
      };
    }
  }

  const textIndexMetadata = await getPdfTextIndexMetadata(file);
  if (textIndexMetadata.likelyImageOnly) {
    if (!normalizedCurrentPage) {
      return undefined;
    }

    const { numPages, pages } = await extractPdfPageRangeText(file, normalizedCurrentPage, normalizedCurrentPage, {
      maxCharsPerPage: Math.floor(DEFAULT_TOTAL_CONTEXT_CHARS / 2),
    });

    return {
      documentContext: buildDocumentContext({
        currentPage: normalizedCurrentPage,
        totalPages: totalPages ?? numPages,
        focus: '현재 페이지',
        pages: [{
          pageNumber: normalizedCurrentPage,
          text: pages[0]?.text || '',
        }],
      }),
      images: await renderPdfPageImages(file, [normalizedCurrentPage], {
        maxWidth: 1280,
        mimeType: 'image/jpeg',
        quality: 0.82,
      }),
    };
  }

  const { numPages, pages } = await extractAllPdfPageText(file);
  const scoredPages = pages
    .filter((page) => page.text.trim().length > 0)
    .map((page) => {
      let score = scorePageText(page.text, queryTokens, references);

      if (normalizedCurrentPage && Math.abs(page.pageNumber - normalizedCurrentPage) <= 1) {
        score += 1;
      }

      if (normalizedCurrentPage && page.pageNumber === normalizedCurrentPage && references.length > 0) {
        score += 4;
      }

      return {
        ...page,
        score,
      };
    })
    .sort((a, b) => b.score - a.score || a.pageNumber - b.pageNumber);

  const selectedPages = scoredPages
    .filter((page) => page.score > 0)
    .slice(0, SEARCH_RESULT_PAGE_LIMIT);

  const fallbackPages = selectedPages.length > 0
    ? selectedPages
    : normalizedCurrentPage
      ? pages.filter((page) => page.pageNumber === normalizedCurrentPage && page.text.trim().length > 0)
      : [];

  if (fallbackPages.length === 0) {
    return undefined;
  }

  const useSummaryExcerpt = isSummaryRequest(userText);
  const finalPages = fallbackPages
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((page) => ({
      pageNumber: page.pageNumber,
      text: buildExcerpt(
        page.text,
        queryTokens,
        references,
        useSummaryExcerpt ? SEARCH_PAGE_EXCERPT_CHARS : Math.floor(SEARCH_PAGE_EXCERPT_CHARS * 1.2),
      ),
    }));

  return {
    documentContext: {
      kind: 'pdf',
      currentPage: normalizedCurrentPage,
      totalPages: totalPages ?? numPages,
      focus:
        finalPages.length === 1
          ? `${finalPages[0].pageNumber}페이지`
          : `${finalPages[0].pageNumber}, ${finalPages[finalPages.length - 1].pageNumber}페이지 포함 관련 문맥`,
      pages: finalPages,
    },
    images: preferredCurrentPageImages,
  };
}
