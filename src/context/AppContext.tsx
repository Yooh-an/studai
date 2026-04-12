'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { getDocumentCacheId, loadCachedChatMessages, saveCachedChatMessages } from '../lib/documentCache';

export type FileType = 'pdf' | 'epub' | null;
export type AppView = 'workspace' | 'settings';

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  pendingResponse?: boolean;
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
  addMessage: (msg: Message) => void;
  
  isChatOpen: boolean;
  setChatOpen: (isOpen: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_CHAT_MESSAGES: Message[] = [
  { id: 'welcome', role: 'model', content: '안녕하세요! 문서에 대해 무엇이든 물어보세요.' },
];

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
  const [chatMessages, setChatMessages] = useState<Message[]>(DEFAULT_CHAT_MESSAGES);
  const [hasLoadedCachedChat, setHasLoadedCachedChat] = useState(false);
  const [isChatOpen, setChatOpen] = useState(true);

  const documentCacheId = useMemo(
    () => (currentFile ? getDocumentCacheId(currentFile) : null),
    [currentFile],
  );

  useEffect(() => {
    setHasLoadedCachedChat(false);

    if (!documentCacheId) {
      setChatMessages(DEFAULT_CHAT_MESSAGES);
      setHasLoadedCachedChat(true);
      return;
    }

    const cachedMessages = loadCachedChatMessages(documentCacheId);
    setChatMessages(cachedMessages.length > 0 ? cachedMessages : DEFAULT_CHAT_MESSAGES);
    setHasLoadedCachedChat(true);
  }, [documentCacheId]);

  useEffect(() => {
    if (!documentCacheId || !hasLoadedCachedChat) return;
    saveCachedChatMessages(documentCacheId, chatMessages);
  }, [chatMessages, documentCacheId, hasLoadedCachedChat]);

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

  const addMessage = useCallback((msg: Message) => {
    setChatMessages((prev) => [...prev, { ...msg, pendingResponse: msg.pendingResponse ?? false }]);
  }, []);

  const setSelectionHighlightAction = useCallback((action: (() => void) | null) => {
    setSelectionHighlightActionState(() => action);
  }, []);

  const contextValue = useMemo(() => ({
    isAuthenticated, login, logout,
    currentView, setCurrentView,
    currentFile, fileType, setFile,
    currentPdfPage, setCurrentPdfPage,
    currentPdfNumPages, setCurrentPdfNumPages,
    selectedText, setSelectedText,
    popupPosition, setPopupPosition,
    selectionHighlightAction, setSelectionHighlightAction,
    chatMessages, addMessage,
    isChatOpen, setChatOpen,
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
    addMessage,
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
