import React, { useCallback, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { UploadCloud, FileText, Book } from 'lucide-react';
import { getFileTypeFromFile, SUPPORTED_FILE_ACCEPT } from '../lib/fileUtils';

export function Uploader() {
  const { setFile } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    const fileType = getFileTypeFromFile(file);

    if (fileType) {
      setFile(file, fileType);
    } else {
      alert('PDF 또는 EPUB 파일만 업로드 가능합니다.');
    }

    input.value = '';
  }, [setFile]);

  const handleOpenFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="flex h-full items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-2xl rounded-2xl border-2 border-dashed border-gray-300 bg-white p-12 text-center shadow-sm transition-all hover:border-blue-500 hover:bg-blue-50">
        <UploadCloud className="mx-auto h-16 w-16 text-gray-400" />
        <h3 className="mt-4 text-xl font-semibold text-gray-900">문서 업로드</h3>
        <p className="mt-2 text-gray-500">
          500MB 이상의 대용량 PDF 또는 EPUB 파일을 지원합니다.
        </p>
        
        <div className="mt-8 flex justify-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FileText className="h-5 w-5 text-red-500" />
            PDF 지원
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Book className="h-5 w-5 text-green-500" />
            EPUB 지원
          </div>
        </div>

        <div className="mt-8">
          <input
            ref={fileInputRef}
            id="file-upload"
            name="file-upload"
            type="file"
            accept={SUPPORTED_FILE_ACCEPT}
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={handleOpenFilePicker}
            className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            파일 선택하기
          </button>
        </div>
      </div>
    </div>
  );
}
