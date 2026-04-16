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
  const hasMathOperator = /[=<>+\-*/]|\\(?:in|times|cdot|neq|leq|geq|approx|quad|sum|int|frac|sqrt|mathbb|mathbf|mathrm|begin|end|vdots|dots)/.test(text);
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

function wrapInlineMath(rawContent: string) {
  const content = stripOuterMathDelimiters(rawContent);
  return `$${content}$`;
}

function wrapDisplayMath(rawContent: string) {
  const content = stripOuterMathDelimiters(rawContent);
  return `$$\n${content}\n$$`;
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

    result += displayMode ? wrapDisplayMath(rawContent) : wrapInlineMath(rawContent);

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
    const content = match.trim();
    if (!isLikelyMathCandidate(content)) return match;
    return wrapDisplayMath(content);
  });
}

function splitLinePrefix(line: string) {
  const match = line.match(/^(\s*(?:[-*+]\s+|\d+\.\s+)?)?(.*)$/);
  return {
    prefix: match?.[1] ?? '',
    content: match?.[2] ?? line,
  };
}

function isMathPlaceholder(text: string) {
  return /__STUDAI_(?:MATH|GENERATED_MATH)_\d+__/.test(text.trim());
}

function findMathStartIndex(content: string) {
  const patterns = [
    /\b[A-Za-z](?:_[A-Za-z0-9()]+|\^\{[^}]+\})?(?:\[[^\]]+\])?\s*(?==|\\in|\\times|\\quad|\\cdot|\\neq|\\leq|\\geq|\\approx)/,
    /\\(?:mathbb|mathbf|mathrm|frac|sum|int|sqrt|quad|dots|vdots|cdots|in|times|neq|leq|geq|text)\b/,
    /\b[A-Z]\[[^\]]+\]/,
  ];

  const indexes = patterns
    .map((pattern) => content.search(pattern))
    .filter((index) => index >= 0);

  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function isLikelyMathContinuationLine(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (isMathPlaceholder(trimmed)) return true;
  if (/^\\(?:in|quad|vdots|dots|cdots|neq|times|begin|end)/.test(trimmed)) return true;
  if (/^[A-Za-z](?:_[A-Za-z0-9()]+|\^\{[^}]+\})?(?:\[[^\]]+\])?(?:\s+[A-Za-z](?:_[A-Za-z0-9()]+|\^\{[^}]+\})?(?:\[[^\]]+\])?)*\s*(?:=|\\in|\\times)?/.test(trimmed) && isLikelyMathCandidate(trimmed)) return true;
  return false;
}

function normalizeNakedMathBlocks(input: string, resolvePlaceholder: (text: string) => string) {
  const lines = input.split('\n');
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const { prefix, content } = splitLinePrefix(line);
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      output.push(line);
      continue;
    }

    if (isMathPlaceholder(trimmedContent)) {
      output.push(line);
      continue;
    }

    const mathStart = findMathStartIndex(content);
    if (mathStart === -1) {
      output.push(line);
      continue;
    }

    const prose = content.slice(0, mathStart).trimEnd();
    const mathHead = content.slice(mathStart).trim();
    const continuationLines: string[] = [];
    let forceContinuation = /(?:=|\\quad|\\in)\s*$/.test(mathHead);

    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      const nextContent = splitLinePrefix(next).content.trim();
      if (!nextContent) break;
      if (!forceContinuation && !isLikelyMathContinuationLine(nextContent)) break;
      continuationLines.push(isMathPlaceholder(nextContent) ? stripOuterMathDelimiters(resolvePlaceholder(nextContent)) : nextContent);
      forceContinuation = /(?:=|\\quad|\\in)\s*$/.test(nextContent);
      index += 1;
    }

    if (continuationLines.length > 0) {
      if (prose) {
        output.push(`${prefix}${prose}`.trimEnd());
        output.push('');
      }
      output.push(wrapDisplayMath([mathHead, ...continuationLines].join('\n')));
      continue;
    }

    if (isLikelyMathCandidate(mathHead)) {
      output.push(`${prefix}${prose ? `${prose} ` : ''}${wrapInlineMath(mathHead)}`.trimEnd());
      continue;
    }

    output.push(line);
  }

  return output.join('\n');
}

function normalizeInlineMathFragments(input: string) {
  const patterns = [
    /([A-Za-z](?:_[A-Za-z0-9()]+|\^\{[^}]+\})?(?:\[[^\]]+\])?\s*=\s*[A-Za-z](?:_[A-Za-z0-9()]+|\^\{[^}]+\})?(?:\[[^\]]+\])?(?:\s*(?:[+\-*/]|\\times|\\cdot)\s*[A-Za-z](?:_[A-Za-z0-9()]+|\^\{[^}]+\})?(?:\[[^\]]+\])?)*)/g,
    /([A-Za-z](?:_[A-Za-z0-9()]+|\^\{[^}]+\})?\s*\\in\s*\{?[^가-힣,.;\n]+\}?)/g,
    /(h_[A-Za-z0-9]+\^\{[^}]+\}\s*=\s*[^가-힣\n]+?)(?=\s*\(|$)/g,
  ];

  return patterns.reduce((current, pattern) => current.replace(pattern, (match) => {
    const content = match.trim();
    if (!isLikelyMathCandidate(content)) return match;
    return wrapInlineMath(content);
  }), input);
}

function cleanupDanglingMathBrackets(input: string) {
  return input
    .replace(/(^|\n)\s*\[\s*(?=\$\$)/g, '$1')
    .replace(/(?<=\$\$)\s*\]\s*(?=\n|$)/g, '')
    .replace(/(^|\n)\s*\]\s*(?=\n|$)/g, '$1')
    .replace(/(\$[^\n$]+\$)\s*\]/g, '$1')
    .replace(/\[\s*(\$[^\n$]+\$)/g, '$1')
    .replace(/\]\s*\[(?=\$)/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function normalizeWhitespaceAroundDisplayMath(input: string) {
  return input
    .replace(/([^\n])(\n\$\$\n)/g, '$1\n$2')
    .replace(/(\n\$\$)([^\n])/g, '$1\n$2')
    .replace(/(\n\$\$\n)(\n{3,})/g, '$1\n')
    .replace(/\n{3,}/g, '\n\n');
}

function mergeAdjacentDisplayAndInlineMath(input: string) {
  return input.replace(/\$\$\n([\s\S]*?)\n\$\$\n\s*\$([^\n$]+)\$/g, (_, block, inline) => {
    return `$$\n${block}\n${inline}\n$$`;
  });
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
  const protectedGeneratedMath = protectSegments(
    environmentNormalized,
    /(\$\$[\s\S]*?\$\$)|(\$[^\n$]+\$)/g,
    'GENERATED_MATH',
  );

  const lineNormalized = normalizeNakedMathBlocks(
    protectedGeneratedMath.output,
    (text) => protectedGeneratedMath.restore(text),
  );
  const protectedLineGeneratedMath = protectSegments(
    lineNormalized,
    /(\$\$[\s\S]*?\$\$)|(\$[^\n$]+\$)/g,
    'LINE_MATH',
  );
  const fragmentNormalized = normalizeInlineMathFragments(protectedLineGeneratedMath.output);
  const cleaned = normalizeWhitespaceAroundDisplayMath(cleanupDanglingMathBrackets(fragmentNormalized));

  const restored = protectedFences.restore(
    protectedInlineCode.restore(
      protectedExistingMath.restore(
        protectedGeneratedMath.restore(
          protectedLineGeneratedMath.restore(cleaned),
        ),
      ),
    ),
  );

  return normalizeWhitespaceAroundDisplayMath(mergeAdjacentDisplayAndInlineMath(restored));
}
