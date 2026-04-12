import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Palette, RefreshCw, Server } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { DEFAULT_AI_PROVIDER, readStoredAIProvider, writeStoredAIProvider } from '../lib/providerPreferences';
import {
  DEFAULT_CHAT_FONT_SIZE,
  MAX_CHAT_FONT_SIZE,
  MIN_CHAT_FONT_SIZE,
  readStoredChatFontSize,
  writeStoredChatFontSize,
} from '../lib/chatPreferences';
import { fetchProviderStatus, validateProvider } from '../lib/aiClient';
import type { AIProvider } from '../types/ai';

interface ProviderStatus {
  provider: AIProvider;
  authenticated?: boolean;
  ok: boolean;
  error?: string;
}

interface ValidationResult {
  ok: boolean;
  message: string;
  response?: string;
  model?: string;
}

export function SettingsPage() {
  const { setCurrentView } = useAppContext();
  const [savedProvider, setSavedProvider] = useState<AIProvider>(DEFAULT_AI_PROVIDER);
  const [candidateProvider, setCandidateProvider] = useState<AIProvider>(DEFAULT_AI_PROVIDER);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [chatFontSize, setChatFontSize] = useState(DEFAULT_CHAT_FONT_SIZE);

  useEffect(() => {
    const storedProvider = readStoredAIProvider();
    setSavedProvider(storedProvider);
    setCandidateProvider(storedProvider);
    setChatFontSize(readStoredChatFontSize());
  }, []);

  useEffect(() => {
    void refreshStatus(candidateProvider);
    setValidationResult(null);
  }, [candidateProvider]);

  const providerLabel = useMemo(() => (
    candidateProvider === 'claude' ? 'Claude Code' : 'Codex'
  ), [candidateProvider]);

  const refreshStatus = async (provider: AIProvider) => {
    setIsRefreshing(true);
    try {
      const status = await fetchProviderStatus(provider);
      setProviderStatus({
        provider,
        ok: status.ok,
        authenticated: status.authenticated,
        error: status.error,
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleValidateAndSave = async () => {
    setIsValidating(true);
    setValidationResult(null);

    try {
      const result = await validateProvider(candidateProvider);
      setValidationResult({
        ok: result.ok,
        message: result.ok
          ? `${providerLabel} responded successfully.`
          : `${providerLabel} validation failed.`,
        response: result.response,
        model: result.model,
      });

      if (result.ok) {
        writeStoredAIProvider(candidateProvider);
        setSavedProvider(candidateProvider);
        await refreshStatus(candidateProvider);
      }
    } catch (error) {
      setValidationResult({
        ok: false,
        message: error instanceof Error ? error.message : 'Provider validation failed.',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleChatFontSizeChange = (value: number) => {
    const next = writeStoredChatFontSize(value);
    setChatFontSize(next);
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <button
          onClick={() => setCurrentView('workspace')}
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-gray-800"
        >
          <ArrowLeft size={13} strokeWidth={2} />
          Back to workspace
        </button>

        <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">Settings</h1>
        <p className="mb-10 text-lg italic text-gray-500">Configure your study workspace.</p>

        <section className="mb-10">
          <div className="mb-5 flex items-center gap-2">
            <Server size={16} strokeWidth={2} className="text-gray-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900">AI Provider</h2>
          </div>

          <div className="space-y-5 rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Default provider</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  New chats use this provider unless you switch later.
                </p>
              </div>
              <span className="rounded bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                {savedProvider === 'claude' ? 'Claude Code' : 'Codex'}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Provider
                </label>
                <select
                  value={candidateProvider}
                  onChange={(event) => setCandidateProvider(event.target.value as AIProvider)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
                >
                  <option value="codex">Codex</option>
                  <option value="claude">Claude Code</option>
                </select>
              </div>

              <button
                onClick={() => void refreshStatus(candidateProvider)}
                disabled={isRefreshing}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                <RefreshCw size={12} strokeWidth={2} className={isRefreshing ? 'animate-spin' : ''} />
                Refresh status
              </button>
            </div>


            <div className="rounded-xl bg-gray-50 px-4 py-4">
              {providerStatus === null ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Checking provider status...</span>
                </div>
              ) : providerStatus.ok ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-emerald-600" />
                    <span className="text-sm font-semibold text-gray-900">
                      {providerLabel} is available on this machine
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {providerStatus.authenticated === false
                      ? 'Provider runtime is reachable, but no authenticated login was reported.'
                      : 'Provider runtime is available and can be used from the chat panel.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    Could not confirm a usable {providerLabel} runtime yet.
                  </p>
                  {providerStatus.error && (
                    <p className="text-xs text-rose-700">{providerStatus.error}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => void handleValidateAndSave()}
                disabled={isValidating || isRefreshing}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isValidating ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Testing {providerLabel}...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} strokeWidth={2} />
                    Validate and set as default
                  </>
                )}
              </button>

              {candidateProvider !== savedProvider && (
                <span className="text-xs text-gray-500">
                  Current saved default is still {savedProvider === 'claude' ? 'Claude Code' : 'Codex'}.
                </span>
              )}
            </div>

            {validationResult && (
              <div className={`rounded-lg px-4 py-3 text-sm ${validationResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                <p className="font-medium">{validationResult.message}</p>
                {(validationResult.model || validationResult.response) && (
                  <p className="mt-1 text-xs opacity-80">
                    {validationResult.model && <>Model: {validationResult.model}. </>}
                    {validationResult.response && <>Probe response: {validationResult.response}</>}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-5 flex items-center gap-2">
            <Palette size={16} strokeWidth={2} className="text-gray-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900">Appearance</h2>
          </div>

          <div className="space-y-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
            <div>
              <div className="mb-2 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">Chat font size</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Adjust the reading size used in the chat panel.
                  </p>
                </div>
                <span className="min-w-11 rounded bg-gray-100 px-2 py-1 text-center text-xs font-semibold text-gray-600">
                  {chatFontSize}px
                </span>
              </div>

              <input
                type="range"
                min={MIN_CHAT_FONT_SIZE}
                max={MAX_CHAT_FONT_SIZE}
                step={1}
                value={chatFontSize}
                onChange={(event) => handleChatFontSizeChange(Number(event.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="mt-2 flex justify-between text-[11px] text-gray-400">
                <span>{MIN_CHAT_FONT_SIZE}px</span>
                <span>{MAX_CHAT_FONT_SIZE}px</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
