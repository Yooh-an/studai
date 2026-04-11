import type { AIProvider } from '../types/ai';

export const DEFAULT_AI_PROVIDER: AIProvider = 'codex';
export const AI_PROVIDER_STORAGE_KEY = 'studai-ai-provider';
export const AI_PROVIDER_EVENT = 'studai-ai-provider-change';

export function parseAIProvider(value: string | null | undefined): AIProvider | undefined {
  if (value === 'codex' || value === 'claude') {
    return value;
  }

  return undefined;
}

export function readStoredAIProvider(): AIProvider {
  if (typeof window === 'undefined') {
    return DEFAULT_AI_PROVIDER;
  }

  return parseAIProvider(window.localStorage.getItem(AI_PROVIDER_STORAGE_KEY)) || DEFAULT_AI_PROVIDER;
}

export function writeStoredAIProvider(provider: AIProvider): AIProvider {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(AI_PROVIDER_STORAGE_KEY, provider);
    window.dispatchEvent(new CustomEvent(AI_PROVIDER_EVENT, { detail: provider }));
  }

  return provider;
}
