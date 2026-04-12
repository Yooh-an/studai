import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, Send, Bot, User, Loader2, ChevronDown, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import TextareaAutosize from 'react-textarea-autosize';
import { fetchChatModels, requestChatReply } from '../lib/aiClient';
import { PdfContextResolutionError, resolvePdfDocumentContext } from '../lib/pdfQueryPlanner';
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

export function ChatPanel() {
  const {
    isChatOpen,
    setChatOpen,
    setCurrentView,
    chatMessages,
    addMessage,
    currentFile,
    fileType,
    currentPdfPage,
    currentPdfNumPages,
  } = useAppContext();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(readStoredAIProvider());
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [chatFontSize, setChatFontSize] = useState(DEFAULT_CHAT_FONT_SIZE);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isChatOpen]);

  useEffect(() => {
    const lastMessage = chatMessages[chatMessages.length - 1];
    if (lastMessage?.role === 'user' && lastMessage.pendingResponse && !isLoading) {
      void handleGenerateResponse(lastMessage.content);
    }
  }, [chatMessages, isLoading]);

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
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowModelPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleGenerateResponse = async (userText: string) => {
    setIsLoading(true);
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
        messages: chatMessages
          .filter((message) => message.role === 'user' || message.role === 'model')
          .map((message) => ({
            role: message.role === 'model' ? 'assistant' as const : 'user' as const,
            content: message.content,
          })),
      });

      addMessage({
        id: Date.now().toString(),
        role: 'model',
        content: response.text,
      });
    } catch (error) {
      console.error('Failed to generate content:', error);
      addMessage({
        id: Date.now().toString(),
        role: 'model',
        content:
          error instanceof PdfContextResolutionError
            ? error.message
            : '응답을 생성하지 못했습니다. 다시 시도해주세요.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');

    addMessage({
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

  if (!isChatOpen) return null;

  return (
    <div className="flex h-full w-full flex-col border-l bg-white shadow-xl">
      <div className="border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">AI Assistant</h3>
            </div>
          </div>
          <button
            onClick={() => setChatOpen(false)}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2" ref={pickerRef}>
          <button
            onClick={() => setShowModelPicker((open) => !open)}
            className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            <span className="truncate">{selectedModel || formatProviderLabel(selectedProvider)}</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setCurrentView('settings')}
            className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Settings
          </button>
        </div>

        {showModelPicker && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
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

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
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

      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="relative flex items-end">
          <TextareaAutosize
            minRows={1}
            maxRows={6}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="질문 입력... (Shift+Enter로 줄바꿈)"
            className="w-full resize-none rounded-2xl border border-gray-300 bg-gray-50 px-4 py-3 pr-12 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            style={{ fontSize: `${chatFontSize}px` }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute bottom-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
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
