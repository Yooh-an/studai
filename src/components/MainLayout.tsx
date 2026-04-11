import React, { useCallback, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Uploader } from './Uploader';
import { PdfViewer } from './PdfViewer';
import { EpubViewer } from './EpubViewer';
import { ChatPanel } from './ChatPanel';
import { AskAIPopup } from './AskAIPopup';
import { SettingsPage } from './SettingsPage';
import { LogOut, BookOpen, FolderOpen, MessageSquare, Settings } from 'lucide-react';
import { getFileTypeFromFile, SUPPORTED_FILE_ACCEPT } from '../lib/fileUtils';

export function MainLayout() {
  const { currentFile, currentView, fileType, logout, isChatOpen, setChatOpen, setCurrentView, setFile } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      alert('PDF 또는 EPUB 파일만 업로드 가능합니다.');
    }

    input.value = '';
  }, [setChatOpen, setFile]);

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
          <h1 className="text-lg font-bold text-gray-900">Codex Study Platform</h1>
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
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            <LogOut className="h-4 w-4" />
            Logout
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
          {currentFile && <ChatPanel />}
        </div>
      )}
    </div>
  );
}
