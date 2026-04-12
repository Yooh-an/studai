import type { ChatImageAttachment } from './chatApi';
import { getPdfDocument } from './pdfText';

const pageImagePromiseCache = new WeakMap<File, Map<string, Promise<ChatImageAttachment>>>();

interface RenderPdfPageImageOptions {
  maxWidth?: number;
  quality?: number;
  mimeType?: ChatImageAttachment['mimeType'];
}

function getCacheKey(pageNumber: number, options: RenderPdfPageImageOptions) {
  return [pageNumber, options.maxWidth ?? 1280, options.quality ?? 0.82, options.mimeType ?? 'image/jpeg'].join(':');
}

export async function renderPdfPageImage(
  file: File,
  pageNumber: number,
  options: RenderPdfPageImageOptions = {},
): Promise<ChatImageAttachment> {
  if (typeof document === 'undefined') {
    throw new Error('PDF page rendering is only available in the browser.');
  }

  let fileCache = pageImagePromiseCache.get(file);
  if (!fileCache) {
    fileCache = new Map<string, Promise<ChatImageAttachment>>();
    pageImagePromiseCache.set(file, fileCache);
  }

  const cacheKey = getCacheKey(pageNumber, options);
  let imagePromise = fileCache.get(cacheKey);
  if (!imagePromise) {
    imagePromise = (async () => {
      const pdfDocument = await getPdfDocument(file);
      const page = await pdfDocument.getPage(pageNumber);
      const defaultViewport = page.getViewport({ scale: 1 });
      const maxWidth = options.maxWidth ?? 1280;
      const scale = Math.min(2.2, Math.max(1, maxWidth / defaultViewport.width));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });

      if (!context) {
        throw new Error('페이지 이미지를 생성할 수 없습니다.');
      }

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: context, viewport }).promise;

      const mimeType = options.mimeType ?? 'image/jpeg';
      const quality = options.quality ?? 0.82;
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const [, data = ''] = dataUrl.split(',', 2);

      return {
        data,
        mimeType,
        pageNumber,
        label: `${pageNumber}페이지`,
      };
    })();

    fileCache.set(cacheKey, imagePromise);
  }

  return await imagePromise;
}

export async function renderPdfPageImages(
  file: File,
  pageNumbers: number[],
  options: RenderPdfPageImageOptions = {},
) {
  const uniquePageNumbers = [...new Set(pageNumbers)].filter((pageNumber) => pageNumber > 0);
  const images: ChatImageAttachment[] = [];

  for (const pageNumber of uniquePageNumbers) {
    images.push(await renderPdfPageImage(file, pageNumber, options));
  }

  return images;
}
