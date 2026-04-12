import React, { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Sparkles, Highlighter } from 'lucide-react';

export function AskAIPopup() {
  const {
    popupPosition,
    setPopupPosition,
    selectedText,
    setChatOpen,
    addMessage,
    selectionHighlightAction,
    setSelectionHighlightAction,
  } = useAppContext();
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopupPosition(null);
        setSelectionHighlightAction(null);
      }
    };

    if (popupPosition) {
      document.addEventListener('mousedown', handleMouseDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [popupPosition, setPopupPosition, setSelectionHighlightAction]);

  if (!popupPosition) return null;

  const handleAskAI = () => {
    setChatOpen(true);
    addMessage({
      id: Date.now().toString(),
      role: 'user',
      content: `다음 텍스트에 대해 설명해주세요:\n\n"${selectedText}"`,
      pendingResponse: true,
    });
    setPopupPosition(null);
    setSelectionHighlightAction(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleHighlight = () => {
    selectionHighlightAction?.();
    setPopupPosition(null);
    setSelectionHighlightAction(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div
      ref={popupRef}
      className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-lg bg-gray-900 p-1 shadow-xl"
      style={{ left: popupPosition.x, top: popupPosition.y }}
    >
      <button
        onClick={handleAskAI}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        <Sparkles className="h-4 w-4 text-blue-400" />
        Ask AI
      </button>
      {selectionHighlightAction && (
        <>
          <div className="h-4 w-px bg-gray-700"></div>
          <button
            onClick={handleHighlight}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            <Highlighter className="h-4 w-4 text-yellow-400" />
            Highlight
          </button>
        </>
      )}

      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
    </div>
  );
}
