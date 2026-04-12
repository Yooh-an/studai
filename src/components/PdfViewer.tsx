import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eraser,
  GripVertical,
  Highlighter,
  Minus,
  MousePointer2,
  Pencil,
  SlidersHorizontal,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import {
  type AnnotationStroke,
  type AnnotationTool,
  buildStroke,
  eraseStrokeAtPoint,
  strokeToSvgPath,
  updateStrokeWithPoint,
} from '../lib/pdfAnnotations';
import {
  getDocumentCacheId,
  loadCachedPdfAnnotations,
  loadCachedPdfLastPage,
  loadCachedPdfScale,
  saveCachedPdfAnnotations,
  saveCachedPdfLastPage,
  saveCachedPdfScale,
} from '../lib/documentCache';
import {
  clampPdfScale,
  getPdfScaleFromPinchGesture,
  isScrollAtGestureBoundary,
  normalizeWheelDelta,
} from '../lib/documentGestures';
import { primePdfTextIndex } from '../lib/pdfText';

// Initialize PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  file: File;
}

const TOOLBAR_COLORS = ['#2563eb', '#111827', '#ef4444', '#16a34a', '#f59e0b', '#a855f7'];
const PAGE_GESTURE_THRESHOLD = 96;
const PAGE_GESTURE_COOLDOWN_MS = 320;

interface ToolButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolButton({ active, label, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
        active
          ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
          : 'border-transparent bg-transparent text-gray-600 hover:bg-gray-100'
      }`}
      title={label}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function CompactToolButton({ active, label, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
        active
          ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
      }`}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

interface FloatingIconButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}

function FloatingIconButton({ active, label, onClick, children }: FloatingIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
        active
          ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
          : 'border-transparent bg-transparent text-gray-600 hover:bg-gray-100'
      }`}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

export function PdfViewer({ file }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<AnnotationTool>('select');
  const [activeColor, setActiveColor] = useState('#2563eb');
  const [strokeSize, setStrokeSize] = useState(4);
  const [strokes, setStrokes] = useState<AnnotationStroke[]>([]);
  const [cachedPageNumber, setCachedPageNumber] = useState<number | null>(null);
  const [isToolbarOpen, setIsToolbarOpen] = useState(true);
  const [hasLoadedCachedStrokes, setHasLoadedCachedStrokes] = useState(false);
  const [draftStroke, setDraftStroke] = useState<AnnotationStroke | null>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [floatingToolbarPosition, setFloatingToolbarPosition] = useState({ x: 24, y: 88 });
  const [isFloatingToolbarDragging, setIsFloatingToolbarDragging] = useState(false);
  const [floatingToolbarPanel, setFloatingToolbarPanel] = useState<'tool' | 'color' | 'size' | null>(null);
  const [isDocumentHovered, setIsDocumentHovered] = useState(false);
  const [isDocumentFocused, setIsDocumentFocused] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const floatingToolbarRef = useRef<HTMLDivElement>(null);
  const documentCacheId = useMemo(() => getDocumentCacheId(file), [file]);
  const draftStrokeRef = useRef<AnnotationStroke | null>(null);
  const isPointerActiveRef = useRef(false);
  const wheelGestureDeltaRef = useRef(0);
  const lastWheelGestureAtRef = useRef(0);
  const pendingPageAnchorRef = useRef<'top' | 'bottom' | null>(null);
  const gestureStartScaleRef = useRef<number | null>(null);
  const lastSafariGestureScaleRef = useRef(1);
  const floatingToolbarDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const {
    setPopupPosition,
    setSelectedText,
    setCurrentPdfPage,
    setCurrentPdfNumPages,
  } = useAppContext();

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    setNumPages(null);
    setPageNumber(1);
    setCachedPageNumber(loadCachedPdfLastPage(documentCacheId));
    setScale(loadCachedPdfScale(documentCacheId) ?? 1.2);
    setHasLoadedCachedStrokes(false);
    setStrokes(loadCachedPdfAnnotations(documentCacheId));
    setDraftStroke(null);
    draftStrokeRef.current = null;
    floatingToolbarDragRef.current = null;
    wheelGestureDeltaRef.current = 0;
    lastWheelGestureAtRef.current = 0;
    pendingPageAnchorRef.current = null;
    gestureStartScaleRef.current = null;
    lastSafariGestureScaleRef.current = 1;
    setFloatingToolbarPosition({ x: 24, y: 88 });
    setIsFloatingToolbarDragging(false);
    setFloatingToolbarPanel(null);
    setIsDocumentHovered(false);
    setIsDocumentFocused(false);
    setPopupPosition(null);
    setSelectedText('');
    setCurrentPdfPage(1);
    setCurrentPdfNumPages(null);
    setHasLoadedCachedStrokes(true);

    return () => URL.revokeObjectURL(url);
  }, [documentCacheId, file, setCurrentPdfNumPages, setCurrentPdfPage, setPopupPosition, setSelectedText]);

  useEffect(() => {
    if (!hasLoadedCachedStrokes) return;
    saveCachedPdfAnnotations(documentCacheId, strokes);
  }, [documentCacheId, hasLoadedCachedStrokes, strokes]);

  useEffect(() => {
    if (numPages === null) return;
    saveCachedPdfLastPage(documentCacheId, pageNumber);
  }, [documentCacheId, numPages, pageNumber]);

  useEffect(() => {
    if (fileUrl === null) return;
    saveCachedPdfScale(documentCacheId, scale);
  }, [documentCacheId, fileUrl, scale]);

  useEffect(() => {
    const element = pageRef.current;
    if (!element) return;

    const syncPageSize = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setPageSize({ width: rect.width, height: rect.height });
      }
    };

    syncPageSize();
    const observer = new ResizeObserver(syncPageSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, [pageNumber, scale, fileUrl]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setCurrentPdfNumPages(numPages);
    setPageNumber(Math.min(Math.max(cachedPageNumber ?? 1, 1), numPages));

    const scheduleIndexing = () => primePdfTextIndex(file);
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(scheduleIndexing, { timeout: 1500 });
      return;
    }

    setTimeout(scheduleIndexing, 250);
  }

  useEffect(() => {
    setCurrentPdfPage(pageNumber);
  }, [pageNumber, setCurrentPdfPage]);

  const clampFloatingToolbarPosition = useCallback((position: { x: number; y: number }) => {
    const containerRect = viewerRef.current?.getBoundingClientRect();
    const toolbarRect = floatingToolbarRef.current?.getBoundingClientRect();

    if (!containerRect) return position;

    const padding = 16;
    const toolbarWidth = toolbarRect?.width ?? 320;
    const toolbarHeight = toolbarRect?.height ?? 168;

    return {
      x: Math.min(Math.max(position.x, padding), Math.max(padding, containerRect.width - toolbarWidth - padding)),
      y: Math.min(Math.max(position.y, padding), Math.max(padding, containerRect.height - toolbarHeight - padding)),
    };
  }, []);

  const changePage = (offset: number) => {
    setPageNumber((prevPageNumber) => prevPageNumber + offset);
    setPopupPosition(null);
    setSelectedText('');
    setFloatingToolbarPanel(null);
  };

  const previousPage = () => changePage(-1);
  const nextPage = () => changePage(1);
  const isGestureCaptureActive = isDocumentHovered || isDocumentFocused;

  const handleDocumentWheel = useCallback((event: WheelEvent) => {
    if (!isGestureCaptureActive || isPointerActiveRef.current) return;

    if (event.ctrlKey) {
      event.preventDefault();
      wheelGestureDeltaRef.current = 0;
      setScale((currentScale) =>
        getPdfScaleFromPinchGesture(
          currentScale,
          normalizeWheelDelta(event.deltaY, event.deltaMode, window.innerHeight),
        ),
      );
      return;
    }

    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      wheelGestureDeltaRef.current = 0;
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;

    const normalizedDeltaY = normalizeWheelDelta(event.deltaY, event.deltaMode, container.clientHeight || window.innerHeight);
    const direction = Math.sign(normalizedDeltaY) as -1 | 0 | 1;
    if (!direction) return;

    const canMoveToPreviousPage = direction < 0 && pageNumber > 1;
    const canMoveToNextPage = direction > 0 && numPages !== null && pageNumber < numPages;
    const isAtBoundary = isScrollAtGestureBoundary({
      scrollTop: container.scrollTop,
      clientHeight: container.clientHeight,
      scrollHeight: container.scrollHeight,
      direction: direction < 0 ? -1 : 1,
    });

    if ((!canMoveToPreviousPage && !canMoveToNextPage) || !isAtBoundary) {
      wheelGestureDeltaRef.current = 0;
      return;
    }

    event.preventDefault();

    if (Math.sign(wheelGestureDeltaRef.current) !== direction) {
      wheelGestureDeltaRef.current = 0;
    }

    wheelGestureDeltaRef.current += normalizedDeltaY;

    const now = window.performance.now();
    if (now - lastWheelGestureAtRef.current < PAGE_GESTURE_COOLDOWN_MS) {
      return;
    }

    if (Math.abs(wheelGestureDeltaRef.current) < PAGE_GESTURE_THRESHOLD) {
      return;
    }

    lastWheelGestureAtRef.current = now;
    wheelGestureDeltaRef.current = 0;
    pendingPageAnchorRef.current = direction > 0 ? 'top' : 'bottom';

    if (direction > 0) {
      nextPage();
      return;
    }

    previousPage();
  }, [isGestureCaptureActive, nextPage, numPages, pageNumber, previousPage]);

  const currentPageStrokes = useMemo(
    () => strokes.filter((stroke) => stroke.pageNumber === pageNumber),
    [pageNumber, strokes],
  );

  const visibleStrokes = useMemo(() => {
    if (!draftStroke || draftStroke.pageNumber !== pageNumber) {
      return currentPageStrokes;
    }

    return [...currentPageStrokes, draftStroke];
  }, [currentPageStrokes, draftStroke, pageNumber]);

  const updateDraftStroke = (stroke: AnnotationStroke | null) => {
    draftStrokeRef.current = stroke;
    setDraftStroke(stroke);
  };

  const renderActiveToolIcon = () => {
    switch (activeTool) {
      case 'pen':
        return <Pencil className="h-4 w-4" />;
      case 'highlighter':
        return <Highlighter className="h-4 w-4" />;
      case 'underline':
        return <Minus className="h-4 w-4" />;
      case 'eraser':
        return <Eraser className="h-4 w-4" />;
      case 'select':
      default:
        return <MousePointer2 className="h-4 w-4" />;
    }
  };

  const getRelativePoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  };

  const handleMouseUp = () => {
    if (activeTool !== 'select') return;

    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setPopupPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      });
      setSelectedText(text);
      return;
    }

    setPopupPosition(null);
    setSelectedText('');
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === 'select' || !pageSize.width || !pageSize.height) return;

    const point = getRelativePoint(event);
    if (!point) return;

    isPointerActiveRef.current = true;
    overlayRef.current?.setPointerCapture(event.pointerId);
    setPopupPosition(null);
    window.getSelection()?.removeAllRanges();

    if (activeTool === 'eraser') {
      setStrokes((prevStrokes) =>
        eraseStrokeAtPoint({
          strokes: prevStrokes,
          point,
          pageNumber,
          pageSize,
        }),
      );
      return;
    }

    updateDraftStroke(
      buildStroke({
        pageNumber,
        tool: activeTool,
        color: activeColor,
        size: strokeSize,
        point,
      }),
    );
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerActiveRef.current || !pageSize.width || !pageSize.height) return;

    const point = getRelativePoint(event);
    if (!point) return;

    if (activeTool === 'eraser') {
      setStrokes((prevStrokes) =>
        eraseStrokeAtPoint({
          strokes: prevStrokes,
          point,
          pageNumber,
          pageSize,
        }),
      );
      return;
    }

    const currentDraft = draftStrokeRef.current;
    if (!currentDraft) return;

    updateDraftStroke(updateStrokeWithPoint(currentDraft, point));
  };

  const finishStroke = (event?: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerActiveRef.current) return;

    isPointerActiveRef.current = false;

    if (event && overlayRef.current?.hasPointerCapture(event.pointerId)) {
      overlayRef.current.releasePointerCapture(event.pointerId);
    }

    if (activeTool === 'eraser') {
      return;
    }

    let completedStroke = draftStrokeRef.current;

    if (event && completedStroke) {
      const point = getRelativePoint(event);
      if (point) {
        completedStroke = updateStrokeWithPoint(completedStroke, point);
      }
    }

    if (!completedStroke) return;

    const hasEnoughPoints = completedStroke.tool === 'underline'
      ? completedStroke.points.length >= 2
      : completedStroke.points.length >= 1;

    if (hasEnoughPoints) {
      setStrokes((prevStrokes) => [...prevStrokes, completedStroke!]);
    }

    updateDraftStroke(null);
  };

  const clearCurrentPage = () => {
    setStrokes((prevStrokes) => prevStrokes.filter((stroke) => stroke.pageNumber !== pageNumber));
    updateDraftStroke(null);
  };

  const handleFloatingToolbarDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isToolbarOpen) return;

    event.preventDefault();
    floatingToolbarDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: floatingToolbarPosition.x,
      originY: floatingToolbarPosition.y,
    };
    setIsFloatingToolbarDragging(true);
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = floatingToolbarDragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      setFloatingToolbarPosition(
        clampFloatingToolbarPosition({
          x: dragState.originX + event.clientX - dragState.startX,
          y: dragState.originY + event.clientY - dragState.startY,
        }),
      );
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const dragState = floatingToolbarDragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      floatingToolbarDragRef.current = null;
      setIsFloatingToolbarDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [clampFloatingToolbarPosition]);

  useEffect(() => {
    if (isToolbarOpen) {
      setFloatingToolbarPanel(null);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setFloatingToolbarPosition((currentPosition) => clampFloatingToolbarPosition(currentPosition));
    });

    const handleResize = () => {
      setFloatingToolbarPosition((currentPosition) => clampFloatingToolbarPosition(currentPosition));
    };

    const handlePointerDownOutside = (event: PointerEvent) => {
      if (!floatingToolbarRef.current?.contains(event.target as Node)) {
        setFloatingToolbarPanel(null);
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('pointerdown', handlePointerDownOutside);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointerdown', handlePointerDownOutside);
    };
  }, [clampFloatingToolbarPosition, isToolbarOpen]);

  const handleSafariGestureStart = useCallback((event: Event) => {
    if (!isGestureCaptureActive) return;

    const gestureEvent = event as Event & { scale?: number; cancelable?: boolean };
    if (gestureEvent.cancelable) {
      gestureEvent.preventDefault();
    }

    gestureStartScaleRef.current = scale;
    lastSafariGestureScaleRef.current =
      typeof gestureEvent.scale === 'number' && Number.isFinite(gestureEvent.scale) ? gestureEvent.scale : 1;
  }, [isGestureCaptureActive, scale]);

  const handleSafariGestureChange = useCallback((event: Event) => {
    if (!isGestureCaptureActive) return;

    const gestureEvent = event as Event & { scale?: number; cancelable?: boolean };
    if (gestureEvent.cancelable) {
      gestureEvent.preventDefault();
    }

    const baseScale = gestureStartScaleRef.current ?? scale;
    const gestureScale =
      typeof gestureEvent.scale === 'number' && Number.isFinite(gestureEvent.scale)
        ? gestureEvent.scale
        : lastSafariGestureScaleRef.current;

    lastSafariGestureScaleRef.current = gestureScale;
    setScale(clampPdfScale(baseScale * gestureScale));
  }, [isGestureCaptureActive, scale]);

  const handleSafariGestureEnd = useCallback((event: Event) => {
    if (isGestureCaptureActive) {
      const gestureEvent = event as Event & { cancelable?: boolean };
      if (gestureEvent.cancelable) {
        gestureEvent.preventDefault();
      }
    }

    gestureStartScaleRef.current = null;
    lastSafariGestureScaleRef.current = 1;
  }, [isGestureCaptureActive]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleDocumentWheel, { passive: false });
    container.addEventListener('gesturestart', handleSafariGestureStart as EventListener, { passive: false });
    container.addEventListener('gesturechange', handleSafariGestureChange as EventListener, { passive: false });
    container.addEventListener('gestureend', handleSafariGestureEnd as EventListener, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleDocumentWheel);
      container.removeEventListener('gesturestart', handleSafariGestureStart as EventListener);
      container.removeEventListener('gesturechange', handleSafariGestureChange as EventListener);
      container.removeEventListener('gestureend', handleSafariGestureEnd as EventListener);
    };
  }, [handleDocumentWheel, handleSafariGestureChange, handleSafariGestureEnd, handleSafariGestureStart]);

  useEffect(() => {
    if (!isGestureCaptureActive) {
      wheelGestureDeltaRef.current = 0;
      pendingPageAnchorRef.current = null;
      gestureStartScaleRef.current = null;
      lastSafariGestureScaleRef.current = 1;
    }
  }, [isGestureCaptureActive]);

  useEffect(() => {
    const anchor = pendingPageAnchorRef.current;
    const container = scrollContainerRef.current;
    if (!anchor || !container) return;

    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = anchor === 'bottom' ? container.scrollHeight : 0;
      pendingPageAnchorRef.current = null;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pageNumber, pageSize.height]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;

      const tagName = target.tagName.toLowerCase();
      return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const isUndoShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
      if (isUndoShortcut) {
        event.preventDefault();

        if (draftStrokeRef.current) {
          isPointerActiveRef.current = false;
          updateDraftStroke(null);
          return;
        }

        setStrokes((prevStrokes) => {
          const lastStrokeIndex = [...prevStrokes]
            .map((stroke, index) => ({ stroke, index }))
            .reverse()
            .find(({ stroke }) => stroke.pageNumber === pageNumber)?.index;

          if (lastStrokeIndex === undefined) return prevStrokes;
          return prevStrokes.filter((_, index) => index !== lastStrokeIndex);
        });
        return;
      }

      if (event.key === 'ArrowLeft' && pageNumber > 1) {
        event.preventDefault();
        previousPage();
        return;
      }

      const isNextPageShortcut = event.key === 'ArrowRight' || event.key === ' ' || event.code === 'Space';
      if (isNextPageShortcut && numPages !== null && pageNumber < numPages) {
        event.preventDefault();
        nextPage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextPage, numPages, pageNumber, previousPage]);

  if (!fileUrl) return null;

  return (
    <div ref={viewerRef} className="relative flex h-full flex-col bg-gray-100" onMouseUp={handleMouseUp}>
      <div className="border-b bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3">
          {isToolbarOpen && (
            <>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="-mx-3 min-w-0 flex-1 overflow-x-auto px-3 pb-1">
                  <div className="flex min-w-max items-center gap-3">
                    <div className="flex items-center gap-2">
                      <ToolButton active={activeTool === 'select'} label="선택" onClick={() => setActiveTool('select')}>
                        <MousePointer2 className="h-4 w-4" />
                        선택
                      </ToolButton>
                      <ToolButton active={activeTool === 'pen'} label="펜" onClick={() => setActiveTool('pen')}>
                        <Pencil className="h-4 w-4" />
                        펜
                      </ToolButton>
                      <ToolButton
                        active={activeTool === 'highlighter'}
                        label="형광펜"
                        onClick={() => setActiveTool('highlighter')}
                      >
                        <Highlighter className="h-4 w-4" />
                        형광펜
                      </ToolButton>
                      <ToolButton active={activeTool === 'underline'} label="밑줄" onClick={() => setActiveTool('underline')}>
                        <Minus className="h-4 w-4" />
                        밑줄
                      </ToolButton>
                      <ToolButton active={activeTool === 'eraser'} label="지우개" onClick={() => setActiveTool('eraser')}>
                        <Eraser className="h-4 w-4" />
                        지우개
                      </ToolButton>
                    </div>

                    <div className="h-8 w-px bg-gray-200" aria-hidden="true" />

                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
                      {TOOLBAR_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setActiveColor(color)}
                          className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-105 ${
                            activeColor === color ? 'border-gray-900' : 'border-white'
                          }`}
                          style={{ backgroundColor: color }}
                          title={`색상 ${color}`}
                        />
                      ))}
                    </div>

                    <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                      두께
                      <input
                        type="range"
                        min={2}
                        max={18}
                        step={1}
                        value={strokeSize}
                        onChange={(event) => setStrokeSize(Number(event.target.value))}
                        className="w-24 accent-blue-600"
                      />
                      <span className="w-5 text-right text-xs text-gray-500">{strokeSize}</span>
                    </label>

                    <button
                      type="button"
                      onClick={clearCurrentPage}
                      disabled={currentPageStrokes.length === 0}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      현재 페이지 지우기
                    </button>
                  </div>
                </div>

                <div className="hidden shrink-0 xl:flex xl:items-center xl:justify-end">
                  <button
                    type="button"
                    onClick={() => setIsToolbarOpen((current) => !current)}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                    aria-expanded={isToolbarOpen}
                  >
                    {isToolbarOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {isToolbarOpen ? '도구 숨기기' : '도구 열기'}
                  </button>
                </div>
              </div>

              <div className="flex justify-end xl:hidden">
                <button
                  type="button"
                  onClick={() => setIsToolbarOpen((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                  aria-expanded={isToolbarOpen}
                >
                  {isToolbarOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {isToolbarOpen ? '도구 숨기기' : '도구 열기'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {!isToolbarOpen && (
        <div
          ref={floatingToolbarRef}
          className="absolute z-30"
          style={{ left: floatingToolbarPosition.x, top: floatingToolbarPosition.y }}
        >
          <div className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-white/95 p-1.5 shadow-xl backdrop-blur">
            <div
              onPointerDown={handleFloatingToolbarDragStart}
              className={`inline-flex h-10 w-8 select-none items-center justify-center rounded-xl text-gray-400 touch-none transition-colors hover:bg-gray-100 ${
                isFloatingToolbarDragging ? 'cursor-grabbing bg-gray-100' : 'cursor-grab'
              }`}
              title="드래그해서 이동"
            >
              <GripVertical className="h-4 w-4" />
            </div>

            <FloatingIconButton
              active={floatingToolbarPanel === 'tool'}
              label="도구 선택"
              onClick={() => setFloatingToolbarPanel((current) => (current === 'tool' ? null : 'tool'))}
            >
              {renderActiveToolIcon()}
            </FloatingIconButton>

            <FloatingIconButton
              active={floatingToolbarPanel === 'color'}
              label="색상 선택"
              onClick={() => setFloatingToolbarPanel((current) => (current === 'color' ? null : 'color'))}
            >
              <span
                className="block h-4 w-4 rounded-full border border-gray-300"
                style={{ backgroundColor: activeColor }}
              />
            </FloatingIconButton>

            <FloatingIconButton
              active={floatingToolbarPanel === 'size'}
              label="두께 선택"
              onClick={() => setFloatingToolbarPanel((current) => (current === 'size' ? null : 'size'))}
            >
              <span className="flex h-4 w-4 items-center justify-center">
                <span
                  className="block w-4 rounded-full bg-current"
                  style={{ height: `${Math.max(2, Math.min(6, strokeSize / 2))}px` }}
                />
              </span>
            </FloatingIconButton>

            <button
              type="button"
              onClick={clearCurrentPage}
              disabled={currentPageStrokes.length === 0}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="현재 페이지 지우기"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {floatingToolbarPanel && (
            <div className="mt-2 rounded-2xl border border-gray-200 bg-white/95 p-2 shadow-xl backdrop-blur">
              {floatingToolbarPanel === 'tool' && (
                <div className="flex flex-wrap items-center gap-2">
                  <CompactToolButton
                    active={activeTool === 'select'}
                    label="선택"
                    onClick={() => {
                      setActiveTool('select');
                      setFloatingToolbarPanel(null);
                    }}
                  >
                    <MousePointer2 className="h-4 w-4" />
                  </CompactToolButton>
                  <CompactToolButton
                    active={activeTool === 'pen'}
                    label="펜"
                    onClick={() => {
                      setActiveTool('pen');
                      setFloatingToolbarPanel(null);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </CompactToolButton>
                  <CompactToolButton
                    active={activeTool === 'highlighter'}
                    label="형광펜"
                    onClick={() => {
                      setActiveTool('highlighter');
                      setFloatingToolbarPanel(null);
                    }}
                  >
                    <Highlighter className="h-4 w-4" />
                  </CompactToolButton>
                  <CompactToolButton
                    active={activeTool === 'underline'}
                    label="밑줄"
                    onClick={() => {
                      setActiveTool('underline');
                      setFloatingToolbarPanel(null);
                    }}
                  >
                    <Minus className="h-4 w-4" />
                  </CompactToolButton>
                  <CompactToolButton
                    active={activeTool === 'eraser'}
                    label="지우개"
                    onClick={() => {
                      setActiveTool('eraser');
                      setFloatingToolbarPanel(null);
                    }}
                  >
                    <Eraser className="h-4 w-4" />
                  </CompactToolButton>
                </div>
              )}

              {floatingToolbarPanel === 'color' && (
                <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-2 py-2">
                  {TOOLBAR_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        setActiveColor(color);
                        setFloatingToolbarPanel(null);
                      }}
                      className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-105 ${
                        activeColor === color ? 'border-gray-900' : 'border-white'
                      }`}
                      style={{ backgroundColor: color }}
                      title={`색상 ${color}`}
                    />
                  ))}
                </div>
              )}

              {floatingToolbarPanel === 'size' && (
                <div className="flex min-w-44 items-center gap-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  <SlidersHorizontal className="h-4 w-4 text-gray-500" />
                  <input
                    type="range"
                    min={2}
                    max={18}
                    step={1}
                    value={strokeSize}
                    onChange={(event) => setStrokeSize(Number(event.target.value))}
                    className="w-24 flex-1 accent-blue-600"
                  />
                  <span className="w-5 text-right text-[11px] text-gray-500">{strokeSize}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div
        ref={scrollContainerRef}
        tabIndex={0}
        aria-label="PDF 문서 뷰어"
        className={`flex flex-1 overflow-auto overscroll-contain p-4 outline-none transition-shadow ${
          isGestureCaptureActive ? 'ring-2 ring-blue-200 ring-inset' : ''
        }`}
        onPointerEnter={() => setIsDocumentHovered(true)}
        onPointerLeave={() => setIsDocumentHovered(false)}
        onFocus={() => setIsDocumentFocused(true)}
        onBlur={() => setIsDocumentFocused(false)}
        onPointerDownCapture={() => {
          scrollContainerRef.current?.focus({ preventScroll: true });
          setIsDocumentFocused(true);
        }}
      >
        <div className="mx-auto">
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
              </div>
            }
            className="shadow-lg"
          >
            <div ref={pageRef} className="relative inline-block">
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="bg-white"
                onRenderSuccess={() => {
                  const rect = pageRef.current?.getBoundingClientRect();
                  if (rect && rect.width > 0 && rect.height > 0) {
                    setPageSize({ width: rect.width, height: rect.height });
                  }
                }}
              />

              <div
                ref={overlayRef}
                className={`absolute inset-0 z-10 touch-none ${
                  activeTool === 'select' ? 'pointer-events-none' : 'pointer-events-auto'
                } ${activeTool === 'eraser' ? 'cursor-cell' : activeTool === 'select' ? 'cursor-text' : 'cursor-crosshair'}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishStroke}
                onPointerLeave={finishStroke}
                onPointerCancel={finishStroke}
              >
                <svg
                  width={pageSize.width}
                  height={pageSize.height}
                  viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
                  className="pointer-events-none absolute inset-0"
                >
                  {visibleStrokes.map((stroke) => {
                    const path = strokeToSvgPath(stroke, pageSize);
                    const key = `${stroke.id}-${stroke.points.length}`;

                    if (stroke.points.length === 1) {
                      const point = stroke.points[0];
                      return (
                        <circle
                          key={key}
                          cx={point.x * pageSize.width}
                          cy={point.y * pageSize.height}
                          r={stroke.size / 2}
                          fill={stroke.color}
                          opacity={stroke.opacity}
                          style={{ mixBlendMode: stroke.blendMode }}
                        />
                      );
                    }

                    return (
                      <path
                        key={key}
                        d={path}
                        fill="none"
                        stroke={stroke.color}
                        strokeWidth={stroke.size}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={stroke.opacity}
                        style={{ mixBlendMode: stroke.blendMode }}
                      />
                    );
                  })}
                </svg>
              </div>
            </div>
          </Document>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 border-t bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={previousPage}
            className="rounded p-1 hover:bg-gray-100 disabled:opacity-50"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <p className="text-sm text-gray-700">
            Page <span className="font-medium">{pageNumber}</span> of{' '}
            <span className="font-medium">{numPages || '--'}</span>
          </p>
          <button
            type="button"
            disabled={numPages === null || pageNumber >= numPages}
            onClick={nextPage}
            className="rounded p-1 hover:bg-gray-100 disabled:opacity-50"
          >
            <ChevronRight className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2 py-1">
          <button
            type="button"
            onClick={() => setScale((currentScale) => clampPdfScale(currentScale - 0.1))}
            className="rounded p-1 hover:bg-gray-100"
            title="축소"
          >
            <ZoomOut className="h-5 w-5 text-gray-600" />
          </button>
          <span className="min-w-14 text-center text-sm text-gray-600">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={() => setScale((currentScale) => clampPdfScale(currentScale + 0.1))}
            className="rounded p-1 hover:bg-gray-100"
            title="확대"
          >
            <ZoomIn className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  );
}
