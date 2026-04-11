import type { FileType } from '../context/AppContext';

export const SUPPORTED_FILE_ACCEPT = '.pdf,.epub,application/pdf,application/epub+zip';

export function getFileTypeFromFile(file: File): FileType {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return 'pdf';
  }

  if (file.type === 'application/epub+zip' || file.name.toLowerCase().endsWith('.epub')) {
    return 'epub';
  }

  return null;
}
