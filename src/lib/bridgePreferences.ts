export const LEGACY_LOCAL_CHAT_API_URL = 'http://localhost:8787/api/chat';
export const DEFAULT_CHAT_API_URL = '/api/chat';
export const BRIDGE_URL_STORAGE_KEY = 'studai-chat-api-url';
export const BRIDGE_URL_EVENT = 'studai-chat-api-url-change';

function isLegacyLocalBridgeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && url.port === '8787'
      && url.pathname === '/api/chat';
  } catch {
    return false;
  }
}

export function sanitizeBridgeUrl(value: string | null | undefined) {
  if (!value) {
    return DEFAULT_CHAT_API_URL;
  }

  const normalized = value.trim().replace(/\/$/, '');

  if (!normalized) {
    return DEFAULT_CHAT_API_URL;
  }

  if (isLegacyLocalBridgeUrl(normalized)) {
    return DEFAULT_CHAT_API_URL;
  }

  return normalized;
}

export function readStoredBridgeUrl() {
  if (typeof window === 'undefined') {
    return DEFAULT_CHAT_API_URL;
  }

  return sanitizeBridgeUrl(window.localStorage.getItem(BRIDGE_URL_STORAGE_KEY));
}

export function writeStoredBridgeUrl(value: string) {
  const next = sanitizeBridgeUrl(value);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(BRIDGE_URL_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(BRIDGE_URL_EVENT, { detail: next }));
  }

  return next;
}

export function buildBridgeHealthUrl(chatApiUrl: string) {
  return sanitizeBridgeUrl(chatApiUrl).replace(/\/api\/chat$/, '/health');
}

export function buildBridgeModelsUrl(chatApiUrl: string) {
  return sanitizeBridgeUrl(chatApiUrl).replace(/\/api\/chat$/, '/api/models');
}
