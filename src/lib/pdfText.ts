import { pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const documentPromiseCache = new WeakMap<File, Promise<any>>();
const pageTextPromiseCache = new WeakMap<File, Map<number, Promise<string>>>();
const allPagesPromiseCache = new WeakMap<File, Promise<ExtractedPdfFullText>>();

function normalizeExtractedText(text: string) {
  return text
    .replace(/\u0000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function getPdfDocument(file: File) {
  let existingPromise = documentPromiseCache.get(file);
  if (!existingPromise) {
    existingPromise = (async () => {
      const data = new Uint8Array(await file.arrayBuffer());
      return await pdfjs.getDocument({ data }).promise;
    })();
    documentPromiseCache.set(file, existingPromise);
  }

  return await existingPromise;
}

export async function getPdfPageCount(file: File) {
  const pdfDocument = await getPdfDocument(file);
  return pdfDocument.numPages as number;
}

export async function extractPdfPageText(file: File, pageNumber: number) {
  let filePageCache = pageTextPromiseCache.get(file);
  if (!filePageCache) {
    filePageCache = new Map<number, Promise<string>>();
    pageTextPromiseCache.set(file, filePageCache);
  }

  let pageTextPromise = filePageCache.get(pageNumber);
  if (!pageTextPromise) {
    pageTextPromise = (async () => {
      const pdfDocument = await getPdfDocument(file);
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: any) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
        .join(' ');

      return normalizeExtractedText(text);
    })();

    filePageCache.set(pageNumber, pageTextPromise);
  }

  return await pageTextPromise;
}

export interface ExtractedPdfPageText {
  pageNumber: number;
  text: string;
  truncated: boolean;
}

export interface ExtractedPdfFullText {
  numPages: number;
  pages: Array<{
    pageNumber: number;
    text: string;
  }>;
}

interface ExtractPdfPageRangeOptions {
  maxCharsPerPage?: number;
}

export async function extractPdfPageRangeText(
  file: File,
  startPage: number,
  endPage: number,
  options: ExtractPdfPageRangeOptions = {},
) {
  const pdfDocument = await getPdfDocument(file);
  const maxCharsPerPage = options.maxCharsPerPage ?? 2500;

  if (startPage < 1 || endPage < 1 || startPage > pdfDocument.numPages || endPage > pdfDocument.numPages) {
    throw new Error(`Requested pages ${startPage}-${endPage} are outside the document range 1-${pdfDocument.numPages}.`);
  }

  const pages: ExtractedPdfPageText[] = [];

  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
    const fullText = await extractPdfPageText(file, pageNumber);
    const truncated = fullText.length > maxCharsPerPage;

    pages.push({
      pageNumber,
      text: truncated ? `${fullText.slice(0, maxCharsPerPage).trimEnd()}…` : fullText,
      truncated,
    });
  }

  return {
    numPages: pdfDocument.numPages as number,
    pages,
  };
}

export async function extractAllPdfPageText(file: File) {
  let allPagesPromise = allPagesPromiseCache.get(file);
  if (!allPagesPromise) {
    allPagesPromise = (async () => {
      const numPages = await getPdfPageCount(file);
      const pages = [] as ExtractedPdfFullText['pages'];

      for (let pageNumber = 1; pageNumber <= numPages; pageNumber += 1) {
        pages.push({
          pageNumber,
          text: await extractPdfPageText(file, pageNumber),
        });
      }

      return { numPages, pages };
    })();

    allPagesPromiseCache.set(file, allPagesPromise);
  }

  return await allPagesPromise;
}

export function primePdfTextIndex(file: File) {
  void extractAllPdfPageText(file).catch(() => {
    // Ignore background indexing failures. Individual queries will surface actionable errors.
  });
}
