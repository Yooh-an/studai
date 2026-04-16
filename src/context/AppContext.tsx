'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { getDocumentCacheId, loadCachedChatSessions, saveCachedChatSessions } from '../lib/documentCache';

export type FileType = 'pdf' | 'epub' | null;
export type AppView = 'workspace' | 'settings';

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  pendingResponse?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

interface AppContextType {
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;

  currentView: AppView;
  setCurrentView: (view: AppView) => void;

  currentFile: File | null;
  fileType: FileType;
  setFile: (file: File | null, type: FileType) => void;
  currentPdfPage: number | null;
  setCurrentPdfPage: (page: number | null) => void;
  currentPdfNumPages: number | null;
  setCurrentPdfNumPages: (pageCount: number | null) => void;

  selectedText: string;
  setSelectedText: (text: string) => void;

  popupPosition: { x: number; y: number } | null;
  setPopupPosition: (pos: { x: number; y: number } | null) => void;
  selectionHighlightAction: (() => void) | null;
  setSelectionHighlightAction: (action: (() => void) | null) => void;

  chatMessages: Message[];
  chatSessions: ChatSession[];
  activeChatSession: ChatSession | null;
  activeChatSessionId: string | null;
  addMessage: (msg: Message) => void;
  addMessageToSession: (sessionId: string, msg: Message) => void;
  createChatSession: () => string;
  setActiveChatSession: (sessionId: string) => void;

  isChatOpen: boolean;
  setChatOpen: (isOpen: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_CHAT_SESSION_TITLE = '새 대화';
const DEFAULT_CHAT_MESSAGES: Message[] = [
  { id: 'welcome', role: 'model', content: '안녕하세요! 문서에 대해 무엇이든 물어보세요.' },
];

function createChatSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneDefaultChatMessages() {
  return DEFAULT_CHAT_MESSAGES.map((message) => ({ ...message }));
}

function deriveChatSessionTitle(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return DEFAULT_CHAT_SESSION_TITLE;
  return normalized.length > 32 ? `${normalized.slice(0, 32).trimEnd()}…` : normalized;
}

function createEmptyChatSession(): ChatSession {
  const now = Date.now();
  return {
    id: createChatSessionId(),
    title: DEFAULT_CHAT_SESSION_TITLE,
    createdAt: now,
    updatedAt: now,
    messages: cloneDefaultChatMessages(),
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('workspace');
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<FileType>(null);
  const [selectedText, setSelectedText] = useState('');
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectionHighlightAction, setSelectionHighlightActionState] = useState<(() => void) | null>(null);
  const [currentPdfPage, setCurrentPdfPage] = useState<number | null>(null);
  const [currentPdfNumPages, setCurrentPdfNumPages] = useState<number | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([createEmptyChatSession()]);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);
  const [hasLoadedCachedChat, setHasLoadedCachedChat] = useState(false);
  const [isChatOpen, setChatOpen] = useState(true);

  const documentCacheId = useMemo(
    () => (currentFile ? getDocumentCacheId(currentFile) : null),
    [currentFile],
  );

  useEffect(() => {
    setHasLoadedCachedChat(false);

    if (!documentCacheId) {
      const initialSession = createEmptyChatSession();
      setChatSessions([initialSession]);
      setActiveChatSessionId(initialSession.id);
      setHasLoadedCachedChat(true);
      return;
    }

    const cachedState = loadCachedChatSessions(documentCacheId);
    if (cachedState.sessions.length > 0) {
      const resolvedActiveSessionId = cachedState.activeSessionId && cachedState.sessions.some((session) => session.id === cachedState.activeSessionId)
        ? cachedState.activeSessionId
        : cachedState.sessions[0]?.id ?? null;

      setChatSessions(cachedState.sessions);
      setActiveChatSessionId(resolvedActiveSessionId);
      setHasLoadedCachedChat(true);
      return;
    }

    const initialSession = createEmptyChatSession();
    setChatSessions([initialSession]);
    setActiveChatSessionId(initialSession.id);
    setHasLoadedCachedChat(true);
  }, [documentCacheId]);

  useEffect(() => {
    if (!documentCacheId || !hasLoadedCachedChat) return;
    saveCachedChatSessions(documentCacheId, chatSessions, activeChatSessionId);
  }, [chatSessions, documentCacheId, hasLoadedCachedChat, activeChatSessionId]);

  const activeChatSession = useMemo(() => {
    if (chatSessions.length === 0) return null;
    return chatSessions.find((session) => session.id === activeChatSessionId) ?? chatSessions[0];
  }, [activeChatSessionId, chatSessions]);

  const chatMessages = activeChatSession?.messages ?? cloneDefaultChatMessages();

  const login = useCallback(() => {
    setIsAuthenticated(true);
    setCurrentView('workspace');
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setCurrentView('workspace');
  }, []);

  const setFile = useCallback((file: File | null, type: FileType) => {
    setCurrentFile(file);
    setFileType(type);
    setSelectedText('');
    setPopupPosition(null);
    setSelectionHighlightActionState(null);
    setCurrentPdfPage(type === 'pdf' && file ? 1 : null);
    setCurrentPdfNumPages(null);
  }, []);

  const addMessageToSession = useCallback((sessionId: string, msg: Message) => {
    const nextMessage: Message = {
      ...msg,
      pendingResponse: msg.pendingResponse ?? false,
    };

    setChatSessions((prevSessions) =>
      prevSessions.map((session) => {
        if (session.id !== sessionId) return session;

        const nextMessages = [...session.messages, nextMessage];
        const nextTitle =
          session.title === DEFAULT_CHAT_SESSION_TITLE && nextMessage.role === 'user'
            ? deriveChatSessionTitle(nextMessage.content)
            : session.title;

        return {
          ...session,
          title: nextTitle,
          updatedAt: Date.now(),
          messages: nextMessages,
        };
      }),
    );
  }, []);

  const addMessage = useCallback((msg: Message) => {
    if (!activeChatSessionId) return;
    addMessageToSession(activeChatSessionId, msg);
  }, [activeChatSessionId, addMessageToSession]);

  const createChatSession = useCallback(() => {
    const nextSession = createEmptyChatSession();
    setChatSessions((prevSessions) => [nextSession, ...prevSessions]);
    setActiveChatSessionId(nextSession.id);
    return nextSession.id;
  }, []);

  const setActiveChatSession = useCallback((sessionId: string) => {
    setActiveChatSessionId(sessionId);
  }, []);

  const setSelectionHighlightAction = useCallback((action: (() => void) | null) => {
    setSelectionHighlightActionState(() => action);
  }, []);

  const contextValue = useMemo(() => ({
    isAuthenticated,
    login,
    logout,
    currentView,
    setCurrentView,
    currentFile,
    fileType,
    setFile,
    currentPdfPage,
    setCurrentPdfPage,
    currentPdfNumPages,
    setCurrentPdfNumPages,
    selectedText,
    setSelectedText,
    popupPosition,
    setPopupPosition,
    selectionHighlightAction,
    setSelectionHighlightAction,
    chatMessages,
    chatSessions,
    activeChatSession,
    activeChatSessionId,
    addMessage,
    addMessageToSession,
    createChatSession,
    setActiveChatSession,
    isChatOpen,
    setChatOpen,
  }), [
    isAuthenticated,
    login,
    logout,
    currentView,
    currentFile,
    fileType,
    setFile,
    currentPdfPage,
    currentPdfNumPages,
    selectedText,
    popupPosition,
    selectionHighlightAction,
    setSelectionHighlightAction,
    chatMessages,
    chatSessions,
    activeChatSession,
    activeChatSessionId,
    addMessage,
    addMessageToSession,
    createChatSession,
    setActiveChatSession,
    isChatOpen,
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
