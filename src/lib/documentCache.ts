import type { Message } from '../context/AppContext';
import type { AnnotationStroke } from './pdfAnnotations';

const STORAGE_PREFIX = 'studai:cache:v1';
const CHAT_MESSAGES_KEY = 'chat-messages';
const PDF_ANNOTATIONS_KEY = 'pdf-annotations';
const PDF_LAST_PAGE_KEY = 'pdf-last-page';
const PDF_SCALE_KEY = 'pdf-scale';
const EPUB_LAST_LOCATION_KEY = 'epub-last-location';

function getStorageKey(scope: string, documentId: string) {
  return `${STORAGE_PREFIX}:${scope}:${documentId}`;
}

export function getDocumentCacheId(file: Pick<File, 'name' | 'size' | 'lastModified' | 'type'>) {
  return [file.name, file.size, file.lastModified, file.type || 'unknown'].join('::');
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`Failed to read local cache for ${key}:`, error);
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to write local cache for ${key}:`, error);
  }
}

function isMessageRole(role: unknown): role is Message['role'] {
  return role === 'user' || role === 'model';
}

function normalizeMessages(messages: unknown): Message[] {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message): message is Record<string, unknown> => typeof message === 'object' && message !== null)
    .map((message, index) => ({
      id: typeof message.id === 'string' ? message.id : `cached-message-${index}`,
      role: isMessageRole(message.role) ? message.role : 'model',
      content: typeof message.content === 'string' ? message.content : '',
      pendingResponse: false,
    }))
    .filter((message) => message.content.trim().length > 0);
}

export function loadCachedChatMessages(documentId: string): Message[] {
  return normalizeMessages(readStorage<unknown>(getStorageKey(CHAT_MESSAGES_KEY, documentId), []));
}

export function saveCachedChatMessages(documentId: string, messages: Message[]) {
  writeStorage(getStorageKey(CHAT_MESSAGES_KEY, documentId), messages);
}

function isAnnotationPoint(value: unknown): value is AnnotationStroke['points'][number] {
  if (typeof value !== 'object' || value === null) return false;

  const point = value as Record<string, unknown>;
  return typeof point.x === 'number' && typeof point.y === 'number';
}

function isAnnotationStroke(value: unknown): value is AnnotationStroke {
  if (typeof value !== 'object' || value === null) return false;

  const stroke = value as Record<string, unknown>;
  return (
    typeof stroke.id === 'string' &&
    typeof stroke.pageNumber === 'number' &&
    (stroke.tool === 'pen' || stroke.tool === 'highlighter' || stroke.tool === 'underline') &&
    (stroke.source === undefined || stroke.source === 'freehand' || stroke.source === 'selection') &&
    typeof stroke.color === 'string' &&
    typeof stroke.size === 'number' &&
    typeof stroke.opacity === 'number' &&
    (stroke.blendMode === 'normal' || stroke.blendMode === 'multiply') &&
    Array.isArray(stroke.points) &&
    stroke.points.every(isAnnotationPoint)
  );
}

export function loadCachedPdfAnnotations(documentId: string): AnnotationStroke[] {
  const annotations = readStorage<unknown>(getStorageKey(PDF_ANNOTATIONS_KEY, documentId), []);
  if (!Array.isArray(annotations)) return [];

  return annotations.filter(isAnnotationStroke);
}

export function saveCachedPdfAnnotations(documentId: string, annotations: AnnotationStroke[]) {
  writeStorage(getStorageKey(PDF_ANNOTATIONS_KEY, documentId), annotations);
}

export function loadCachedPdfLastPage(documentId: string): number | null {
  const page = readStorage<unknown>(getStorageKey(PDF_LAST_PAGE_KEY, documentId), null);
  return typeof page === 'number' && Number.isFinite(page) && page >= 1 ? Math.floor(page) : null;
}

export function saveCachedPdfLastPage(documentId: string, pageNumber: number) {
  writeStorage(getStorageKey(PDF_LAST_PAGE_KEY, documentId), pageNumber);
}

export function loadCachedPdfScale(documentId: string): number | null {
  const scale = readStorage<unknown>(getStorageKey(PDF_SCALE_KEY, documentId), null);
  return typeof scale === 'number' && Number.isFinite(scale) && scale >= 0.5 && scale <= 3
    ? Math.round(scale * 10) / 10
    : null;
}

export function saveCachedPdfScale(documentId: string, scale: number) {
  const normalizedScale = Math.min(3, Math.max(0.5, Math.round(scale * 10) / 10));
  writeStorage(getStorageKey(PDF_SCALE_KEY, documentId), normalizedScale);
}

export function loadCachedEpubLocation(documentId: string): string | number {
  const location = readStorage<unknown>(getStorageKey(EPUB_LAST_LOCATION_KEY, documentId), 0);
  return typeof location === 'string' || typeof location === 'number' ? location : 0;
}

export function saveCachedEpubLocation(documentId: string, location: string | number) {
  writeStorage(getStorageKey(EPUB_LAST_LOCATION_KEY, documentId), location);
}
