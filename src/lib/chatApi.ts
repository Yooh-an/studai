import type { AIProvider, CodexReasoningEffort, ModelOption } from '../types/ai';

export type ChatRole = 'user' | 'assistant';

export interface ChatApiMessage {
  role: ChatRole;
  content: string;
}

export interface ChatDocumentPageContext {
  pageNumber: number;
  text: string;
}

export interface ChatImageAttachment {
  data: string;
  mimeType: 'image/jpeg' | 'image/png';
  label?: string;
  pageNumber?: number;
}

export interface ChatDocumentContext {
  kind: 'pdf';
  currentPage?: number;
  totalPages?: number;
  focus?: string;
  pages: ChatDocumentPageContext[];
}

export interface ChatCompletionRequest {
  input: string;
  messages: ChatApiMessage[];
  images?: ChatImageAttachment[];
  provider?: AIProvider;
  model?: string;
  reasoningEffort?: CodexReasoningEffort;
  useFastModel?: boolean;
  documentContext?: ChatDocumentContext;
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
