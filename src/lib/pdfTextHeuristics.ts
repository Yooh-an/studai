export const DEFAULT_SPARSE_TEXT_THRESHOLD = 80;

export function assessPdfTextDensity(
  sampledTexts: string[],
  threshold = DEFAULT_SPARSE_TEXT_THRESHOLD,
) {
  const normalizedTexts = sampledTexts.map((text) => text.trim());
  const sampledPages = normalizedTexts.length;
  const totalChars = normalizedTexts.reduce((sum, text) => sum + text.length, 0);
  const averageCharsPerSampledPage = sampledPages > 0 ? totalChars / sampledPages : 0;

  return {
    sampledPages,
    averageCharsPerSampledPage,
    likelyImageOnly: sampledPages > 0 && averageCharsPerSampledPage < threshold,
  };
}
