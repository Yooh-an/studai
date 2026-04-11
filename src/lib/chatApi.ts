import type { AIProvider, ModelOption } from '../types/ai';

export type ChatRole = 'user' | 'assistant';

export interface ChatApiMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionRequest {
  input: string;
  messages: ChatApiMessage[];
  imageBase64?: string;
  provider?: AIProvider;
  model?: string;
}

export interface ChatCompletionResponse {
  text: string;
  provider?: string;
  model?: string;
}

export interface ProviderStatusResponse {
  ok: boolean;
  provider?: string;
  authenticated?: boolean;
  error?: string;
}

export interface ProviderValidationResponse {
  ok: boolean;
  provider?: string;
  message: string;
  response?: string;
  model?: string;
}

export interface ModelsResponse {
  provider?: string;
  models: ModelOption[];
}
