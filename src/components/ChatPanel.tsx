import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, Send, Bot, User, Loader2, ChevronDown, Plus, History } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import TextareaAutosize from 'react-textarea-autosize';
import { fetchChatModels, requestChatReply } from '../lib/aiClient';
import { PdfContextResolutionError, resolvePdfDocumentContext } from '../lib/pdfQueryPlanner';
import { normalizeAssistantMarkdown } from '../lib/math/normalizeAssistantMarkdown';
import {
  AI_PROVIDER_EVENT,
  DEFAULT_AI_PROVIDER,
  readStoredAIProvider,
} from '../lib/providerPreferences';
import {
  CHAT_FONT_SIZE_EVENT,
  DEFAULT_CHAT_FONT_SIZE,
  readStoredChatFontSize,
} from '../lib/chatPreferences';
import type { AIProvider, ModelOption } from '../types/ai';

function formatProviderLabel(provider: AIProvider) {
  return provider === 'claude' ? 'Claude Code' : 'Codex';
}

function formatSessionTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}

export function ChatPanel() {
  const {
    isChatOpen,
    setChatOpen,
    chatMessages,
    chatSessions,
    activeChatSession,
    activeChatSessionId,
    setActiveChatSession,
    createChatSession,
    addMessageToSession,
    currentFile,
    fileType,
    currentPdfPage,
    currentPdfNumPages,
  } = useAppContext();
  const [input, setInput] = useState('');
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(readStoredAIProvider());
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);
  const [chatFontSize, setChatFontSize] = useState(DEFAULT_CHAT_FONT_SIZE);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const historyPickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const isCurrentSessionLoading = loadingSessionId === activeChatSessionId;

  const historySessions = useMemo(
    () => [...chatSessions].sort((left, right) => right.updatedAt - left.updatedAt),
    [chatSessions],
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isChatOpen, activeChatSessionId]);

  useEffect(() => {
    setInput('');
  }, [activeChatSessionId]);

  useEffect(() => {
    const lastMessage = chatMessages[chatMessages.length - 1];
    if (!activeChatSessionId || loadingSessionId) return;

    if (lastMessage?.role === 'user' && lastMessage.pendingResponse) {
      void handleGenerateResponse(activeChatSessionId, lastMessage.content);
    }
  }, [activeChatSessionId, chatMessages, loadingSessionId]);

  useEffect(() => {
    const syncProvider = () => {
      setSelectedProvider(readStoredAIProvider());
    };

    const syncFontSize = () => {
      setChatFontSize(readStoredChatFontSize());
    };

    syncProvider();
    syncFontSize();

    window.addEventListener('storage', syncProvider);
    window.addEventListener('storage', syncFontSize);
    window.addEventListener(AI_PROVIDER_EVENT, syncProvider);
    window.addEventListener(CHAT_FONT_SIZE_EVENT, syncFontSize);

    return () => {
      window.removeEventListener('storage', syncProvider);
      window.removeEventListener('storage', syncFontSize);
      window.removeEventListener(AI_PROVIDER_EVENT, syncProvider);
      window.removeEventListener(CHAT_FONT_SIZE_EVENT, syncFontSize);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      setModelsLoading(true);
      const availableModels = await fetchChatModels(selectedProvider);

      if (cancelled) return;

      setModels(availableModels);
      setSelectedModel((current) => {
        if (current && availableModels.some((model) => model.id === current)) {
          return current;
        }

        return availableModels[0]?.id || '';
      });
      setModelsLoading(false);
    };

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, [selectedProvider]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;

      if (modelPickerRef.current && !modelPickerRef.current.contains(target)) {
        setShowModelPicker(false);
      }

      if (historyPickerRef.current && !historyPickerRef.current.contains(target)) {
        setShowHistoryPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleGenerateResponse = async (sessionId: string, userText: string) => {
    const session = chatSessions.find((item) => item.id === sessionId);
    if (!session) return;

    setLoadingSessionId(sessionId);
    try {
      const resolvedPdfContext =
        fileType === 'pdf' && currentFile
          ? await resolvePdfDocumentContext({
              file: currentFile,
              userText,
              currentPage: currentPdfPage,
              totalPages: currentPdfNumPages,
            })
          : undefined;

      const response = await requestChatReply({
        input: userText,
        provider: selectedProvider || DEFAULT_AI_PROVIDER,
        model: selectedModel || undefined,
        documentContext: resolvedPdfContext?.documentContext,
        images: resolvedPdfContext?.images,
        messages: session.messages
          .filter((message) => message.role === 'user' || message.role === 'model')
          .map((message) => ({
            role: message.role === 'model' ? 'assistant' as const : 'user' as const,
            content: message.content,
          })),
      });

      addMessageToSession(sessionId, {
        id: Date.now().toString(),
        role: 'model',
        content: response.text,
      });
    } catch (error) {
      console.error('Failed to generate content:', error);
      addMessageToSession(sessionId, {
        id: Date.now().toString(),
        role: 'model',
        content:
          error instanceof PdfContextResolutionError
            ? error.message
            : '응답을 생성하지 못했습니다. 다시 시도해주세요.',
      });
    } finally {
      setLoadingSessionId((current) => (current === sessionId ? null : current));
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !activeChatSessionId || isCurrentSessionLoading) return;

    const userMsg = input.trim();
    setInput('');

    addMessageToSession(activeChatSessionId, {
      id: Date.now().toString(),
      role: 'user',
      content: userMsg,
      pendingResponse: true,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCreateNewChat = () => {
    createChatSession();
    setShowHistoryPicker(false);
    setShowModelPicker(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  if (!isChatOpen) return null;

  return (
    <div className="flex h-full w-full flex-col border-l bg-white shadow-xl">
      <div className="border-b px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-gray-900">Agent</h2>
          </div>

          <div className="relative flex shrink-0 items-center gap-1" ref={historyPickerRef}>
            <IconButton onClick={handleCreateNewChat} label="새 대화">
              <Plus className="h-4.5 w-4.5" />
            </IconButton>

            <IconButton
              onClick={() => {
                setShowModelPicker(false);
                setShowHistoryPicker((open) => !open);
              }}
              label="대화 기록"
              active={showHistoryPicker}
            >
              <History className="h-4.5 w-4.5" />
            </IconButton>

            <IconButton onClick={() => setChatOpen(false)} label="Close chat">
              <X className="h-4.5 w-4.5" />
            </IconButton>

            {showHistoryPicker && (
              <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                <div className="flex items-center justify-between px-2 py-1">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">대화 기록</h3>
                    <p className="text-xs text-gray-500">이전 대화를 다시 열 수 있어요.</p>
                  </div>
                </div>

                <div className="mt-2 max-h-80 space-y-1 overflow-y-auto">
                  {historySessions.map((session) => {
                    const isActive = session.id === activeChatSessionId;
                    const firstUserMessage = session.messages.find((message) => message.role === 'user');

                    return (
                      <button
                        key={session.id}
                        onClick={() => {
                          setActiveChatSession(session.id);
                          setShowHistoryPicker(false);
                        }}
                        className={`w-full rounded-xl px-3 py-2 text-left transition-colors ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className={`truncate text-sm font-medium ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>
                            {session.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-gray-400">
                            {formatSessionTimestamp(session.updatedAt)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-gray-500">
                          {firstUserMessage?.content || '아직 메시지가 없습니다.'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3.5">
        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex min-w-0 gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              msg.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'
            }`}>
              {msg.role === 'user' ? (
                <User className="h-5 w-5 text-blue-600" />
              ) : (
                <Bot className="h-5 w-5 text-gray-600" />
              )}
            </div>
            <div
              className={`min-w-0 max-w-[82%] rounded-2xl px-4 py-2 ${
                msg.role === 'user'
                  ? 'break-words rounded-tr-none bg-blue-600 text-white'
                  : 'chat-markdown break-words rounded-tl-none bg-gray-100 text-gray-900 prose prose-sm'
              }`}
              style={{ fontSize: `${chatFontSize}px` }}
            >
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {normalizeAssistantMarkdown(msg.content)}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        {isCurrentSessionLoading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
              <Bot className="h-5 w-5 text-gray-600" />
            </div>
            <div className="flex items-center rounded-2xl rounded-tl-none bg-gray-100 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <form onSubmit={handleSubmit} className="relative flex-1">
            <TextareaAutosize
              ref={inputRef}
              minRows={1}
              maxRows={6}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything, @ to mention, / for workflows"
              className="min-h-10 w-full resize-none rounded-xl border border-gray-300 bg-gray-50 px-4 py-2.5 pr-12 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              style={{ fontSize: `${chatFontSize}px` }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isCurrentSessionLoading}
              className="absolute bottom-1 right-1 flex h-8.5 w-8.5 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

          <div className="relative shrink-0" ref={modelPickerRef}>
            <button
              onClick={() => {
                setShowHistoryPicker(false);
                setShowModelPicker((open) => !open);
              }}
              className="inline-flex h-10 max-w-[120px] min-w-0 items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
              title={selectedModel || formatProviderLabel(selectedProvider)}
            >
              <span className="truncate">{selectedModel || formatProviderLabel(selectedProvider)}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            </button>

            {showModelPicker && (
              <div className="absolute bottom-full right-0 z-20 mb-2 max-h-56 w-60 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                {modelsLoading ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading models...
                  </div>
                ) : models.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-500">
                    No models reported by the active provider.
                  </div>
                ) : (
                  models.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setSelectedModel(model.id);
                        setShowModelPicker(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${selectedModel === model.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
                    >
                      <span className="truncate">{model.display_name || model.id}</span>
                      {selectedModel === model.id && <Checkmark />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Checkmark() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
      <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-8 8a1 1 0 0 1-1.42-.004l-4-4a1 1 0 1 1 1.414-1.414l3.293 3.293 7.296-7.29a1 1 0 0 1 1.411 0Z" clipRule="evenodd" />
    </svg>
  );
}

function IconButton({
  children,
  label,
  onClick,
  active = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${active ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
