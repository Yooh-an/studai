import type { AIProvider, ModelOption } from '../../types/ai';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ProviderStatusResponse,
  ProviderValidationResponse,
} from '../chatApi';
import {
  assertSupportedProvider,
  fetchCodexModels,
  getCodexLoginStatus,
  runCodexTurn,
  validateCodexConnection,
} from './codex';

interface ProviderRuntime {
  listModels: () => Promise<ModelOption[]>;
  getStatus: () => Promise<ProviderStatusResponse>;
  validateConnection: (model?: string) => Promise<ProviderValidationResponse>;
  runTurn: (request: ChatCompletionRequest) => Promise<ChatCompletionResponse>;
}

const codexRuntime: ProviderRuntime = {
  async listModels() {
    return await fetchCodexModels();
  },
  async getStatus() {
    return await getCodexLoginStatus();
  },
  async validateConnection(model?: string) {
    return await validateCodexConnection(model);
  },
  async runTurn(request: ChatCompletionRequest) {
    return await runCodexTurn(request.input, request.messages, request.model);
  },
};

const unsupportedRuntime = (provider: AIProvider): ProviderRuntime => ({
  async listModels() {
    assertSupportedProvider(provider);
    return [];
  },
  async getStatus() {
    return {
      ok: false,
      provider,
      authenticated: false,
      error: 'Claude Code is not implemented in this app yet.',
    };
  },
  async validateConnection() {
    return {
      ok: false,
      provider,
      message: 'Claude Code is not implemented in this app yet.',
      response: 'Not implemented',
    };
  },
  async runTurn() {
    assertSupportedProvider(provider);
    return { provider, text: '' };
  },
});

const providerRegistry: Record<AIProvider, ProviderRuntime> = {
  codex: codexRuntime,
  claude: unsupportedRuntime('claude'),
};

export function getProviderRuntime(provider: AIProvider = 'codex') {
  const runtime = providerRegistry[provider];
  if (!runtime) {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  return runtime;
}
