'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
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
  
  selectedText: string;
  setSelectedText: (text: string) => void;
  
  popupPosition: { x: number; y: number } | null;
  setPopupPosition: (pos: { x: number; y: number } | null) => void;
  
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

  const login = () => {
    setIsAuthenticated(true);
    setCurrentView('workspace');
  };

  const logout = () => {
    setIsAuthenticated(false);
    setCurrentView('workspace');
  };
  
  const setFile = (file: File | null, type: FileType) => {
    setCurrentFile(file);
    setFileType(type);
  };

  const addMessage = (msg: Message) => {
    setChatMessages((prev) => [...prev, { ...msg, pendingResponse: msg.pendingResponse ?? false }]);
  };

  return (
    <AppContext.Provider value={{
      isAuthenticated, login, logout,
      currentView, setCurrentView,
      currentFile, fileType, setFile,
      selectedText, setSelectedText,
      popupPosition, setPopupPosition,
      chatMessages, addMessage,
      isChatOpen, setChatOpen
    }}>
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
