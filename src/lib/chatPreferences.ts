export const CHAT_FONT_SIZE_STORAGE_KEY = 'studai-chat-font-size';
export const CHAT_FONT_SIZE_EVENT = 'studai-chat-font-size-change';
export const DEFAULT_CHAT_FONT_SIZE = 14;
export const MIN_CHAT_FONT_SIZE = 12;
export const MAX_CHAT_FONT_SIZE = 20;

export function clampChatFontSize(value: number) {
  return Math.max(MIN_CHAT_FONT_SIZE, Math.min(MAX_CHAT_FONT_SIZE, Math.round(value)));
}

export function readStoredChatFontSize() {
  if (typeof window === 'undefined') {
    return DEFAULT_CHAT_FONT_SIZE;
  }

  const raw = Number(window.localStorage.getItem(CHAT_FONT_SIZE_STORAGE_KEY));
  return Number.isFinite(raw) ? clampChatFontSize(raw) : DEFAULT_CHAT_FONT_SIZE;
}

export function writeStoredChatFontSize(value: number) {
  const next = clampChatFontSize(value);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CHAT_FONT_SIZE_STORAGE_KEY, String(next));
    window.dispatchEvent(new CustomEvent(CHAT_FONT_SIZE_EVENT, { detail: next }));
  }

  return next;
}
