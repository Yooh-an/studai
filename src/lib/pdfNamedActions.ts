export function getPageNumberForPdfNamedAction(
  action: string,
  currentPageNumber: number,
  numPages: number,
): number | null {
  if (!Number.isFinite(currentPageNumber) || !Number.isFinite(numPages) || numPages < 1) {
    return null;
  }

  switch (action) {
    case 'NextPage':
      return Math.min(currentPageNumber + 1, numPages);
    case 'PrevPage':
      return Math.max(currentPageNumber - 1, 1);
    case 'FirstPage':
      return 1;
    case 'LastPage':
      return numPages;
    default:
      return null;
  }
}
