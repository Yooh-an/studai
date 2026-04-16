import katex from 'katex';

function protectSegments(input: string, pattern: RegExp, key: string) {
  const prefix = `__STUDAI_${key}_`;
  const segments: string[] = [];
  const output = input.replace(pattern, (match) => {
    const token = `${prefix}${segments.length}__`;
    segments.push(match);
    return token;
  });

  return {
    output,
    restore(value: string) {
      return value.replace(new RegExp(`${prefix}(\\d+)__`, 'g'), (_, indexText: string) => {
        const index = Number(indexText);
        return segments[index] ?? '';
      });
    },
  };
}

function stripOuterMathDelimiters(candidate: string) {
  const trimmed = candidate.trim();

  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
    return trimmed.slice(2, -2).trim();
  }

  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }

  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]') && trimmed.length >= 4) {
    return trimmed.slice(2, -2).trim();
  }

  return trimmed;
}

function isLikelyMathCandidate(candidate: string) {
  const text = stripOuterMathDelimiters(candidate);
  if (!text || text.length < 2) return false;

  const hasLatexCommand = /\\[A-Za-z]+/.test(text);
  const hasSubOrSup = /[A-Za-z0-9)}\]][_^][A-Za-z0-9({\\]/.test(text.replace(/\s+/g, ''));
  const hasMathOperator = /[=<>+\-*/]|\\(?:in|times|cdot|neq|leq|geq|approx|quad|sum|int|frac|sqrt|mathbb|mathbf|mathrm|begin|end|vdots)/.test(text);
  const hasMatrixOrCases = /\\begin\{(?:bmatrix|pmatrix|matrix|cases|aligned|align\*?)\}/.test(text);
  const hasIndexing = /[A-Za-z]\[[A-Za-z0-9_]+\]/.test(text);

  const score = Number(hasLatexCommand) + Number(hasSubOrSup) + Number(hasMathOperator) + Number(hasMatrixOrCases) + Number(hasIndexing);
  if (score < 2) return false;

  try {
    katex.renderToString(text, {
      throwOnError: true,
      strict: 'ignore',
      displayMode: hasMatrixOrCases || text.includes('\n') || text.length > 48,
    });
    return true;
  } catch {
    return false;
  }
}

function isBracketWrapperStart(input: string, index: number) {
  if (input[index] !== '[') return false;
  if (index === 0) return true;

  const previousChar = input[index - 1];
  return /\s|[(:=-]/.test(previousChar);
}

function findMatchingBracket(input: string, startIndex: number) {
  let depth = 0;

  for (let index = startIndex; index < input.length; index += 1) {
    const char = input[index];
    if (char === '[') {
      depth += 1;
      continue;
    }

    if (char === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function wrapMathContent(rawContent: string, displayMode: boolean) {
  const content = stripOuterMathDelimiters(rawContent);
  if (!content) return rawContent;

  if (displayMode) {
    return `$$\n${content}\n$$`;
  }

  return `$${content}$`;
}

function normalizeBalancedBracketMath(input: string) {
  let result = '';

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (char !== '[' || !isBracketWrapperStart(input, index)) {
      result += char;
      continue;
    }

    const closingIndex = findMatchingBracket(input, index);
    if (closingIndex === -1) {
      result += char;
      continue;
    }

    const rawContent = input.slice(index + 1, closingIndex);
    if (!isLikelyMathCandidate(rawContent)) {
      result += char;
      continue;
    }

    const displayMode = /\n/.test(rawContent) || /\\begin\{/.test(rawContent);
    const replacement = wrapMathContent(rawContent, displayMode);

    if (displayMode && result.length > 0) {
      result = result.replace(/[ \t]+$/, '');

      if (result.endsWith('\n\n')) {
        // already separated
      } else if (result.endsWith('\n')) {
        result += '\n';
      } else {
        result += '\n\n';
      }
    }

    result += replacement;

    if (displayMode) {
      const nextChar = input[closingIndex + 1] ?? '';
      if (nextChar && nextChar !== '\n') {
        result += '\n';
      }
    }

    index = closingIndex;
  }

  return result;
}

function normalizeLatexEnvironments(input: string) {
  return input.replace(/\\begin\{([a-zA-Z*]+)\}[\s\S]+?\\end\{\1\}/g, (match) => {
    if (!isLikelyMathCandidate(match)) return match;
    return wrapMathContent(match, true);
  });
}

function cleanupDanglingMathBrackets(input: string) {
  return input
    .replace(/(^|\n)\s*\[\s*(?=\$\$)/g, '$1')
    .replace(/(?<=\$\$)\s*\]\s*(?=\n|$)/g, '')
    .replace(/(^|\n)\s*\]\s*(?=\n|$)/g, '$1')
    .replace(/(\$[^\n$]+\$)\s*\]/g, '$1')
    .replace(/\[\s*(\$[^\n$]+\$)/g, '$1');
}

function normalizeWhitespaceAroundDisplayMath(input: string) {
  return input
    .replace(/([^\n])\n?(\$\$\n)/g, '$1\n\n$2')
    .replace(/(\n\$\$)([^\n])/g, '$1\n$2')
    .replace(/(\n\$\$\n)([^\n])/g, '$1$2')
    .replace(/([^\n])(\n\$\$\n)(?!\n)/g, '$1$2')
    .replace(/(\n\$\$)([^\n])/g, '$1\n$2')
    .replace(/(\n\$\$\n)(\n{3,})/g, '$1\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function normalizeAssistantMarkdown(input: string) {
  if (!input.trim()) return input;

  const protectedFences = protectSegments(input, /```[\s\S]*?```/g, 'FENCE');
  const protectedInlineCode = protectSegments(protectedFences.output, /`[^`]+`/g, 'INLINE');

  const bracketNormalized = normalizeBalancedBracketMath(protectedInlineCode.output);
  const protectedExistingMath = protectSegments(
    bracketNormalized,
    /(\$\$[\s\S]*?\$\$)|(\$[^\n$]+\$)/g,
    'MATH',
  );

  const environmentNormalized = normalizeLatexEnvironments(protectedExistingMath.output);
  const cleaned = normalizeWhitespaceAroundDisplayMath(cleanupDanglingMathBrackets(environmentNormalized));

  return protectedFences.restore(
    protectedInlineCode.restore(
      protectedExistingMath.restore(cleaned),
    ),
  );
}
