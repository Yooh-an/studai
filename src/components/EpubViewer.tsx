import React, { useState, useEffect, useMemo } from 'react';
import { ReactReader } from 'react-reader';
import { useAppContext } from '../context/AppContext';
import { getDocumentCacheId, loadCachedEpubLocation, saveCachedEpubLocation } from '../lib/documentCache';

interface EpubViewerProps {
  file: File;
}

export function EpubViewer({ file }: EpubViewerProps) {
  const documentCacheId = useMemo(() => getDocumentCacheId(file), [file]);
  const [location, setLocation] = useState<string | number>(0);
  const [hasLoadedCachedLocation, setHasLoadedCachedLocation] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | ArrayBuffer | null>(null);
  const { setPopupPosition, setSelectedText, setSelectionHighlightAction } = useAppContext();
  const [rendition, setRendition] = useState<any>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setHasLoadedCachedLocation(false);
    setFileUrl(url);
    setLocation(loadCachedEpubLocation(documentCacheId));
    setHasLoadedCachedLocation(true);
    return () => URL.revokeObjectURL(url);
  }, [documentCacheId, file]);

  useEffect(() => {
    if (!hasLoadedCachedLocation) return;
    saveCachedEpubLocation(documentCacheId, location);
  }, [documentCacheId, hasLoadedCachedLocation, location]);

  useEffect(() => {
    if (rendition) {
      const handleSelected = (cfiRange: string, contents: any) => {
        rendition.book.getRange(cfiRange).then((range: any) => {
          const text = range.toString().trim();
          if (text) {
            const rect = range.getBoundingClientRect();
            const iframe = contents.document.defaultView.frameElement;
            const iframeRect = iframe.getBoundingClientRect();
            
            setPopupPosition({
              x: iframeRect.left + rect.left + rect.width / 2,
              y: iframeRect.top + rect.top - 10
            });
            setSelectedText(text);
            setSelectionHighlightAction(null);
          }
        });
      };
      
      rendition.on('selected', handleSelected);
      
      // Clear selection on click inside iframe
      rendition.on('click', () => {
        setPopupPosition(null);
        setSelectionHighlightAction(null);
      });

      return () => {
        rendition.off('selected', handleSelected);
      };
    }
  }, [rendition, setPopupPosition, setSelectedText, setSelectionHighlightAction]);

  if (!fileUrl) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-white">
      <ReactReader
        url={fileUrl}
        location={location}
        locationChanged={(epubcifi: string) => setLocation(epubcifi)}
        getRendition={(r) => setRendition(r)}
        epubInitOptions={{
          openAs: 'epub'
        }}
        epubOptions={{
          flow: 'scrolled',
          manager: 'continuous'
        }}
      />
    </div>
  );
}
