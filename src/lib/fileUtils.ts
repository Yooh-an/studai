import type { FileType } from '../context/AppContext';

export const SUPPORTED_FILE_ACCEPT = '.pdf,application/pdf';

export function getFileTypeFromFile(file: File): FileType {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return 'pdf';
  }

  return null;
}
