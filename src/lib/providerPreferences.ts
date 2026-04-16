import type { AIProvider, CodexReasoningPreference } from '../types/ai';

export const DEFAULT_AI_PROVIDER: AIProvider = 'codex';
export const DEFAULT_CODEX_REASONING_PREFERENCE: CodexReasoningPreference = 'default';
export const DEFAULT_USE_FAST_MODEL = false;

export const AI_PROVIDER_STORAGE_KEY = 'studai-ai-provider';
export const CODEX_REASONING_PREFERENCE_STORAGE_KEY = 'studai-codex-reasoning-preference';
export const USE_FAST_MODEL_STORAGE_KEY = 'studai-use-fast-model';

export const AI_PROVIDER_EVENT = 'studai-ai-provider-change';
export const CODEX_REASONING_PREFERENCE_EVENT = 'studai-codex-reasoning-preference-change';
export const USE_FAST_MODEL_EVENT = 'studai-use-fast-model-change';

function dispatchPreferenceEvent(eventName: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

export function parseAIProvider(value: string | null | undefined): AIProvider | undefined {
  if (value === 'codex' || value === 'claude') {
    return value;
  }

  return undefined;
}

export function parseCodexReasoningPreference(value: string | null | undefined): CodexReasoningPreference | undefined {
  if (value === 'default' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') {
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
    dispatchPreferenceEvent(AI_PROVIDER_EVENT, provider);
  }

  return provider;
}

export function readStoredCodexReasoningPreference(): CodexReasoningPreference {
  if (typeof window === 'undefined') {
    return DEFAULT_CODEX_REASONING_PREFERENCE;
  }

  return parseCodexReasoningPreference(window.localStorage.getItem(CODEX_REASONING_PREFERENCE_STORAGE_KEY)) || DEFAULT_CODEX_REASONING_PREFERENCE;
}

export function writeStoredCodexReasoningPreference(preference: CodexReasoningPreference): CodexReasoningPreference {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CODEX_REASONING_PREFERENCE_STORAGE_KEY, preference);
    dispatchPreferenceEvent(CODEX_REASONING_PREFERENCE_EVENT, preference);
  }

  return preference;
}

export function readStoredUseFastModel(): boolean {
  if (typeof window === 'undefined') {
    return DEFAULT_USE_FAST_MODEL;
  }

  return window.localStorage.getItem(USE_FAST_MODEL_STORAGE_KEY) === 'true';
}

export function writeStoredUseFastModel(value: boolean): boolean {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(USE_FAST_MODEL_STORAGE_KEY, value ? 'true' : 'false');
    dispatchPreferenceEvent(USE_FAST_MODEL_EVENT, value);
  }

  return value;
}
