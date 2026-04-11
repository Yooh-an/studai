import type { AIProvider, ModelOption } from '../types/ai';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ModelsResponse,
  ProviderStatusResponse,
  ProviderValidationResponse,
} from './chatApi';

const CHAT_API_PATH = '/api/chat';
const MODELS_API_PATH = '/api/models';
const PROVIDER_STATUS_API_PATH = '/api/providers/status';
const PROVIDER_VALIDATE_API_PATH = '/api/providers/validate';

async function readJsonSafely<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function requestChatReply(
  request: ChatCompletionRequest,
): Promise<ChatCompletionResponse> {
  const response = await fetch(CHAT_API_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  const data = await readJsonSafely<Partial<ChatCompletionResponse> & { error?: string }>(response);

  if (!response.ok) {
    throw new Error(data?.error || `Chat request failed with ${response.status}`);
  }

  if (!data?.text || typeof data.text !== 'string') {
    throw new Error('Chat API returned an invalid response. Expected { text: string }.');
  }

  return {
    text: data.text,
    provider: data.provider,
    model: data.model,
  };
}

export async function fetchChatModels(provider?: AIProvider): Promise<ModelOption[]> {
  try {
    const response = await fetch(`${MODELS_API_PATH}?provider=${provider || 'codex'}`, {
      cache: 'no-store',
    });

    const data = await readJsonSafely<Partial<ModelsResponse> & { error?: string }>(response);

    if (!response.ok) {
      return [];
    }

    return Array.isArray(data?.models) ? data.models : [];
  } catch {
    return [];
  }
}

export async function fetchProviderStatus(provider?: AIProvider): Promise<ProviderStatusResponse> {
  try {
    const response = await fetch(`${PROVIDER_STATUS_API_PATH}?provider=${provider || 'codex'}`, {
      cache: 'no-store',
    });
    const data = await readJsonSafely<Partial<ProviderStatusResponse> & { error?: string }>(response);

    return {
      ok: Boolean(data?.ok),
      provider: data?.provider,
      authenticated: data?.authenticated,
      error: typeof data?.error === 'string' ? data.error : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      provider,
      authenticated: false,
      error: error instanceof Error ? error.message : 'Failed to reach provider status API',
    };
  }
}

export async function validateProvider(provider?: AIProvider, model?: string): Promise<ProviderValidationResponse> {
  const response = await fetch(PROVIDER_VALIDATE_API_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ provider, model }),
  });

  const data = await readJsonSafely<Partial<ProviderValidationResponse> & { error?: string }>(response);

  if (!response.ok && !data) {
    throw new Error(`Provider validation failed with ${response.status}`);
  }

  return {
    ok: Boolean(data?.ok),
    provider: data?.provider,
    message: typeof data?.message === 'string' ? data.message : 'Provider validation failed.',
    response: typeof data?.response === 'string' ? data.response : undefined,
    model: typeof data?.model === 'string' ? data.model : model,
  };
}
