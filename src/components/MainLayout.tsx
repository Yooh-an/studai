import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Uploader } from './Uploader';
import { PdfViewer } from './PdfViewer';
import { EpubViewer } from './EpubViewer';
import { ChatPanel } from './ChatPanel';
import { AskAIPopup } from './AskAIPopup';
import { SettingsPage } from './SettingsPage';
import { BookOpen, FolderOpen, MessageSquare, Settings } from 'lucide-react';
import { getFileTypeFromFile, SUPPORTED_FILE_ACCEPT } from '../lib/fileUtils';

const CHAT_PANEL_WIDTH_STORAGE_KEY = 'studai.chat-panel-width';
const DEFAULT_CHAT_PANEL_WIDTH = 416;
const MIN_CHAT_PANEL_WIDTH = 320;
const MAX_CHAT_PANEL_WIDTH = 800;

export function MainLayout() {
  const { currentFile, currentView, fileType, isChatOpen, setChatOpen, setCurrentView, setFile } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isResizingChatPanelRef = useRef(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(DEFAULT_CHAT_PANEL_WIDTH);

  const handleOpenFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    const nextFileType = getFileTypeFromFile(file);
    if (nextFileType) {
      setFile(file, nextFileType);
      setChatOpen(true);
    } else {
      alert('PDF 파일만 업로드 가능합니다.');
    }

    input.value = '';
  }, [setChatOpen, setFile]);

  const clampChatPanelWidth = useCallback((width: number) => {
    return Math.min(MAX_CHAT_PANEL_WIDTH, Math.max(MIN_CHAT_PANEL_WIDTH, width));
  }, []);

  useEffect(() => {
    const storedWidth = window.localStorage.getItem(CHAT_PANEL_WIDTH_STORAGE_KEY);
    if (!storedWidth) return;

    const parsedWidth = Number(storedWidth);
    if (Number.isFinite(parsedWidth)) {
      setChatPanelWidth(clampChatPanelWidth(parsedWidth));
    }
  }, [clampChatPanelWidth]);

  useEffect(() => {
    window.localStorage.setItem(CHAT_PANEL_WIDTH_STORAGE_KEY, String(chatPanelWidth));
  }, [chatPanelWidth]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingChatPanelRef.current) return;
      setChatPanelWidth(clampChatPanelWidth(window.innerWidth - event.clientX));
    };

    const stopResizing = () => {
      if (!isResizingChatPanelRef.current) return;
      isResizingChatPanelRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [clampChatPanelWidth]);

  const handleChatResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    isResizingChatPanelRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-white px-4 shadow-sm">
        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_FILE_ACCEPT}
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-blue-600" />
          <h1 className="text-lg font-bold text-gray-900">StudAI</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenFilePicker}
            className="flex items-center gap-2 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            <FolderOpen className="h-4 w-4" />
            {currentFile ? '새 파일 열기' : '파일 열기'}
          </button>
          {!isChatOpen && currentFile && (
            <button
              onClick={() => setChatOpen(true)}
              className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              <MessageSquare className="h-4 w-4" />
              AI Chat
            </button>
          )}
          <button
            onClick={() => setCurrentView(currentView === 'settings' ? 'workspace' : 'settings')}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            <Settings className="h-4 w-4" />
            {currentView === 'settings' ? 'Workspace' : 'Settings'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      {currentView === 'settings' ? (
        <SettingsPage />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Document Viewer Area */}
          <main className="relative min-w-0 flex-1 overflow-hidden">
            {!currentFile ? (
              <Uploader />
            ) : (
              <>
                {fileType === 'pdf' && <PdfViewer file={currentFile} />}
                {fileType === 'epub' && <EpubViewer file={currentFile} />}
                <AskAIPopup />
              </>
            )}
          </main>

          {/* Chat Panel */}
          {currentFile && isChatOpen && (
            <div className="relative h-full shrink-0" style={{ width: `${chatPanelWidth}px` }}>
              <div
                onMouseDown={handleChatResizeStart}
                onDoubleClick={() => setChatPanelWidth(DEFAULT_CHAT_PANEL_WIDTH)}
                className="group absolute inset-y-0 left-0 z-10 w-3 -translate-x-1/2 cursor-col-resize"
                title="드래그해서 채팅 패널 너비 조절"
                aria-label="채팅 패널 너비 조절"
                role="separator"
              >
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 transition-colors group-hover:bg-blue-400" />
              </div>
              <ChatPanel />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
