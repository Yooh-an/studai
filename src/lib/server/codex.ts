import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import type { CodexReasoningEffort, ModelOption } from '../../types/ai';
import type {
  ChatApiMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatDocumentContext,
  ChatImageAttachment,
  ProviderStatusResponse,
  ProviderValidationResponse,
} from '../chatApi';
import { buildCodexPrompt } from './codexPrompt';

const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const MODELS_CACHE_FILE = path.join(CODEX_HOME, 'models_cache.json');
const HIDDEN_CODEX_MODEL_SLUGS = new Set([
  'gpt-5.2',
  'gpt-5.3-codex-spark',
]);

type SupportedProvider = 'codex' | 'claude';

interface ModelRecord {
  slug: string;
  display_name?: string;
  visibility?: string;
  priority?: number;
  default_reasoning_level?: string;
  supported_reasoning_levels?: Array<{ effort?: string }>;
  additional_speed_tiers?: string[];
}

interface ModelsCache {
  models?: ModelRecord[];
}

const SUPPORTED_REASONING_EFFORTS = new Set<CodexReasoningEffort>(['low', 'medium', 'high', 'xhigh']);

interface ResolvedCommand {
  command: string;
  argsPrefix: string[];
}

function getWorkspaceRoot() {
  return process.cwd();
}

async function pathExists(candidate: string) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function resolveCodexExecutable(): Promise<ResolvedCommand> {
  const home = os.homedir();
  const envCandidates = [process.env.CODEX_BIN, process.env.CODEX_PATH].filter(Boolean) as string[];
  const candidates = [
    ...envCandidates,
    path.join(home, '.nvm', 'versions', 'node', 'v24.7.0', 'bin', 'codex'),
    path.join(home, '.npm-global', 'bin', 'codex'),
    path.join(home, '.local', 'bin', 'codex'),
    path.join(home, '.bun', 'bin', 'codex'),
    path.join(home, '.codex', 'bin', 'codex'),
    path.join('/Applications', 'Codex.app', 'Contents', 'Resources', 'codex'),
    path.join('/opt/homebrew', 'bin', 'codex'),
    path.join('/usr/local', 'bin', 'codex'),
    'codex',
  ];

  for (const candidate of candidates) {
    if (candidate === 'codex') {
      return { command: 'codex', argsPrefix: [] };
    }

    if (await pathExists(candidate)) {
      return { command: candidate, argsPrefix: [] };
    }
  }

  throw new Error('Could not find the Codex CLI executable. Set CODEX_BIN if needed.');
}

export async function getCodexLoginStatus(): Promise<ProviderStatusResponse> {
  try {
    const executable = await resolveCodexExecutable();

    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(executable.command, [...executable.argsPrefix, 'login', 'status'], {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout || stderr);
          return;
        }

        reject(new Error(stderr || stdout || `codex login status failed with exit code ${code}`));
      });
    });

    return {
      ok: true,
      provider: 'codex',
      authenticated: /logged in/i.test(output),
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'codex',
      authenticated: false,
      error: error instanceof Error ? error.message : 'Failed to query Codex login status',
    };
  }
}

export async function fetchCodexModels(): Promise<ModelOption[]> {
  try {
    const raw = await fs.readFile(MODELS_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as ModelsCache;

    return (parsed.models || [])
      .filter((model) => model.visibility !== 'hide')
      .filter((model) => !HIDDEN_CODEX_MODEL_SLUGS.has(model.slug))
      .sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER))
      .map((model) => {
        const supportedReasoningLevels = (model.supported_reasoning_levels || [])
          .map((entry) => entry.effort)
          .filter((effort): effort is CodexReasoningEffort => !!effort && SUPPORTED_REASONING_EFFORTS.has(effort as CodexReasoningEffort));
        const speedTiers = Array.isArray(model.additional_speed_tiers)
          ? model.additional_speed_tiers.filter((tier): tier is string => typeof tier === 'string' && tier.trim().length > 0)
          : [];

        return {
          id: model.slug,
          display_name: model.display_name || model.slug,
          owned_by: 'codex',
          created: 0,
          default_reasoning_level:
            typeof model.default_reasoning_level === 'string' && SUPPORTED_REASONING_EFFORTS.has(model.default_reasoning_level as CodexReasoningEffort)
              ? model.default_reasoning_level as CodexReasoningEffort
              : undefined,
          supported_reasoning_levels: supportedReasoningLevels.length > 0 ? supportedReasoningLevels : undefined,
          speed_tiers: speedTiers.length > 0 ? speedTiers : undefined,
          supports_fast: speedTiers.includes('fast'),
        };
      });
  } catch {
    return [];
  }
}

async function writeImageAttachments(images: ChatImageAttachment[]) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studai-chat-images-'));
  const filePaths: string[] = [];

  for (const [index, image] of images.entries()) {
    const extension = image.mimeType === 'image/png' ? 'png' : 'jpg';
    const filePath = path.join(tempDir, `image-${index + 1}.${extension}`);
    await fs.writeFile(filePath, Buffer.from(image.data, 'base64'));
    filePaths.push(filePath);
  }

  return {
    tempDir,
    filePaths,
  };
}

function extractNumberTokens(text: string) {
  return [...new Set(text.match(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/g) || [])];
}

function normalizeNumericToken(value: string) {
  return value.replace(/,/g, '');
}

function containsLikelyUnwrappedMath(text: string) {
  return /\[[^\]\n]*(?:\\[A-Za-z]+|[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9({\\]+|\^|=|\\times|\\in|\\mathbb|\\text|\\mathrm)[^\]\n]*\]/.test(text)
    || /\\\([^\n]+\\\)|\\\[[\s\S]*?\\\]/.test(text)
    || /(?:^|\s)(?:\\mathbb|\\mathrm|\\text|\\frac|\\sqrt)\{/.test(text);
}

function asksForPageSpecificDetails(input: string, documentContext?: ChatDocumentContext) {
  if (!documentContext || documentContext.kind !== 'pdf') return false;

  return /(?:이|현재|지금)\s*(?:페이지|쪽)|this\s+page|attached\s+page|구체|정확|크기|차원|몇|토큰\s*수|행렬|벡터/i.test(input)
    || /현재 페이지|보고 있는 페이지/.test(documentContext.focus || '');
}

export function shouldRewriteAnswerFromDocumentEvidence(params: {
  input: string;
  responseText: string;
  documentContext?: ChatDocumentContext;
}) {
  const { input, responseText, documentContext } = params;

  if (containsLikelyUnwrappedMath(responseText)) {
    return true;
  }

  if (!documentContext || documentContext.kind !== 'pdf') return false;

  if (!asksForPageSpecificDetails(input, documentContext)) {
    return false;
  }

  const evidenceText = documentContext.pages.map((page) => page.text).join('\n');
  const evidenceNumbers = extractNumberTokens(evidenceText).map(normalizeNumericToken);
  if (evidenceNumbers.length === 0) {
    return false;
  }

  const responseNumbers = extractNumberTokens(responseText).map(normalizeNumericToken);
  if (responseNumbers.length === 0) {
    return /(구체|정확|크기|차원|토큰\s*수|몇)/i.test(input);
  }

  const evidenceSet = new Set(evidenceNumbers);
  const overlapCount = responseNumbers.filter((value) => evidenceSet.has(value)).length;

  return overlapCount === 0;
}

function buildGroundedRewritePrompt(params: {
  input: string;
  responseText: string;
  documentContext?: ChatDocumentContext;
}) {
  const { input, responseText, documentContext } = params;

  return [
    documentContext
      ? 'Rewrite the assistant answer so it is grounded in the supplied document evidence.'
      : 'Rewrite the assistant answer so that all math formatting uses standard Markdown math delimiters.',
    'Keep the answer concise, helpful, and in the same language as the original answer.',
    documentContext
      ? 'Use the exact concrete values, identifiers, and terminology from the document evidence when they are available.'
      : 'Preserve the original meaning and wording as much as possible.',
    documentContext
      ? 'Do not invent generic textbook examples when the evidence already provides concrete values.'
      : 'Only fix math formatting and obvious notation issues.',
    'Format every math expression with standard Markdown math delimiters: `$...$` for inline math and `$$...$$` for display math.',
    'Never use `\\(...\\)`, `\\[...\\]`, or `[ ... ]` as math delimiters in the final answer.',
    'If the original answer is already correct, only fix formatting and grounding issues.',
    '',
    'User request:',
    input,
    '',
    ...(documentContext
      ? [
          'Document evidence:',
          documentContext.pages.map((page) => `Page ${page.pageNumber}: ${page.text}`).join('\n\n'),
          '',
        ]
      : []),
    'Original assistant answer:',
    responseText,
  ].join('\n');
}

async function executeCodexPrompt(
  prompt: string,
  model?: string,
  images?: ChatImageAttachment[],
  reasoningEffort?: CodexReasoningEffort,
  useFastModel?: boolean,
) {
  const executable = await resolveCodexExecutable();
  const args = [
    ...executable.argsPrefix,
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--cd',
    getWorkspaceRoot(),
  ];

  if (model) {
    args.push('--model', model);
  }

  if (reasoningEffort) {
    args.push('-c', `reasoning_level=${JSON.stringify(reasoningEffort)}`);
  }

  if (useFastModel) {
    args.push('-c', 'model_speed_tier="fast"');
  }

  let imageTempDir: string | undefined;

  try {
    if (Array.isArray(images) && images.length > 0) {
      const writtenImages = await writeImageAttachments(images);
      imageTempDir = writtenImages.tempDir;
      for (const filePath of writtenImages.filePaths) {
        args.push('--image', filePath);
      }
    }

    args.push('--', prompt);

    return await new Promise<{ text: string; model?: string }>((resolve, reject) => {
      const child = spawn(executable.command, args, {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdoutBuffer = '';
      let stderr = '';
      let finalText = '';

      const consumeLine = (line: string) => {
        if (!line.trim()) return;

        try {
          const event = JSON.parse(line) as Record<string, unknown>;

          if (event.type === 'item.completed') {
            const item = event.item as { type?: unknown; text?: unknown } | undefined;
            if (item?.type === 'agent_message' && typeof item.text === 'string') {
              finalText = item.text.trim();
            }
          }
        } catch {
          // Ignore non-JSON lines.
        }
      };

      child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || '';
        for (const line of lines) consumeLine(line);
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', reject);
      child.on('close', (code) => {
        if (stdoutBuffer.trim()) {
          consumeLine(stdoutBuffer.trim());
        }

        if (code !== 0) {
          reject(new Error(stderr || `codex exec failed with exit code ${code}`));
          return;
        }

        if (!finalText) {
          reject(new Error(stderr || 'Codex did not return a final assistant message.'));
          return;
        }

        resolve({ text: finalText, model });
      });
    });
  } finally {
    if (imageTempDir) {
      await fs.rm(imageTempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function runCodexTurn(
  input: string,
  messages: ChatApiMessage[],
  model?: string,
  documentContext?: ChatDocumentContext,
  images?: ChatImageAttachment[],
  reasoningEffort?: CodexReasoningEffort,
  useFastModel?: boolean,
): Promise<ChatCompletionResponse> {
  const prompt = buildCodexPrompt({ input, messages, documentContext, images });
  let result = await executeCodexPrompt(prompt, model, images, reasoningEffort, useFastModel);

  if (shouldRewriteAnswerFromDocumentEvidence({ input, responseText: result.text, documentContext })) {
    const rewritePrompt = buildGroundedRewritePrompt({
      input,
      responseText: result.text,
      documentContext,
    });

    result = await executeCodexPrompt(rewritePrompt, model, images, reasoningEffort, useFastModel);
  }

  return {
    provider: 'codex',
    model: result.model,
    text: result.text,
  };
}

export async function validateCodexConnection(
  model?: string,
  reasoningEffort?: CodexReasoningEffort,
  useFastModel?: boolean,
): Promise<ProviderValidationResponse> {
  const result = await runCodexTurn(
    'Reply with exactly OK.',
    [{ role: 'user', content: 'Reply with exactly OK.' }],
    model,
    undefined,
    undefined,
    reasoningEffort,
    useFastModel,
  );

  return {
    ok: /^ok\b/i.test(result.text.trim()),
    provider: 'codex',
    message: /^ok\b/i.test(result.text.trim())
      ? 'Codex responded successfully.'
      : 'Codex validation failed.',
    response: result.text.trim(),
    model: result.model || model,
  };
}

export function assertSupportedProvider(provider: SupportedProvider) {
  if (provider !== 'codex') {
    throw new Error('Claude Code is not implemented in this app yet.');
  }
}

export function normalizeProvider(value: unknown): SupportedProvider {
  return value === 'claude' ? 'claude' : 'codex';
}

function normalizeImages(value: unknown): ChatImageAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const images = value
    .filter((image): image is ChatImageAttachment => {
      if (typeof image !== 'object' || image === null) return false;
      const candidate = image as Record<string, unknown>;
      return (
        typeof candidate.data === 'string'
        && candidate.data.trim().length > 0
        && (candidate.mimeType === 'image/jpeg' || candidate.mimeType === 'image/png')
      );
    })
    .map((image) => ({
      data: image.data.trim(),
      mimeType: image.mimeType,
      label: typeof image.label === 'string' && image.label.trim() ? image.label.trim() : undefined,
      pageNumber:
        typeof image.pageNumber === 'number' && Number.isFinite(image.pageNumber) && image.pageNumber > 0
          ? Math.floor(image.pageNumber)
          : undefined,
    }));

  return images.length > 0 ? images : undefined;
}

function normalizeReasoningEffort(value: unknown): CodexReasoningEffort | undefined {
  if (typeof value === 'string' && SUPPORTED_REASONING_EFFORTS.has(value as CodexReasoningEffort)) {
    return value as CodexReasoningEffort;
  }

  return undefined;
}

function normalizeDocumentContext(value: unknown): ChatDocumentContext | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const candidate = value as Partial<ChatDocumentContext> & {
    pages?: Array<{ pageNumber?: unknown; text?: unknown }>;
  };

  if (candidate.kind !== 'pdf' || !Array.isArray(candidate.pages)) {
    return undefined;
  }

  const pages = candidate.pages
    .filter((page): page is { pageNumber: number; text: string } =>
      !!page && typeof page.pageNumber === 'number' && Number.isFinite(page.pageNumber) && typeof page.text === 'string' && page.text.trim().length > 0,
    )
    .map((page) => ({
      pageNumber: Math.max(1, Math.floor(page.pageNumber)),
      text: page.text.trim(),
    }));

  if (pages.length === 0) return undefined;

  return {
    kind: 'pdf',
    currentPage:
      typeof candidate.currentPage === 'number' && Number.isFinite(candidate.currentPage) && candidate.currentPage > 0
        ? Math.floor(candidate.currentPage)
        : undefined,
    totalPages:
      typeof candidate.totalPages === 'number' && Number.isFinite(candidate.totalPages) && candidate.totalPages > 0
        ? Math.floor(candidate.totalPages)
        : undefined,
    focus: typeof candidate.focus === 'string' && candidate.focus.trim() ? candidate.focus.trim() : undefined,
    pages,
  };
}

export function parseChatRequestBody(body: unknown): ChatCompletionRequest {
  const payload = (body ?? {}) as Partial<ChatCompletionRequest>;

  return {
    input: typeof payload.input === 'string' ? payload.input : '',
    messages: Array.isArray(payload.messages)
      ? payload.messages.filter(
          (message): message is ChatApiMessage =>
            !!message
            && (message.role === 'user' || message.role === 'assistant')
            && typeof message.content === 'string',
        )
      : [],
    images: normalizeImages(payload.images),
    provider: normalizeProvider(payload.provider),
    model: typeof payload.model === 'string' && payload.model.trim() ? payload.model : undefined,
    reasoningEffort: normalizeReasoningEffort(payload.reasoningEffort),
    useFastModel: payload.useFastModel === true,
    documentContext: normalizeDocumentContext(payload.documentContext),
  };
}
