import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import type { ModelOption } from '../../types/ai';
import type {
  ChatApiMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatDocumentContext,
  ChatImageAttachment,
  ProviderStatusResponse,
  ProviderValidationResponse,
} from '../chatApi';

const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const MODELS_CACHE_FILE = path.join(CODEX_HOME, 'models_cache.json');

type SupportedProvider = 'codex' | 'claude';

interface ModelRecord {
  slug: string;
  display_name?: string;
  visibility?: string;
  priority?: number;
}

interface ModelsCache {
  models?: ModelRecord[];
}

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

function buildDocumentContextSection(documentContext?: ChatDocumentContext, images?: ChatImageAttachment[]) {
  const hasPages = !!documentContext && documentContext.kind === 'pdf' && Array.isArray(documentContext.pages) && documentContext.pages.length > 0;
  const hasImages = Array.isArray(images) && images.length > 0;

  if (!hasPages && !hasImages) {
    return '';
  }

  const pageBlocks = hasPages
    ? documentContext.pages.map((page) => `[PDF page ${page.pageNumber}]\n${page.text}`).join('\n\n')
    : '';

  return [
    'Document context (hidden support context, do not mention this section explicitly unless the user asks about sources):',
    `- Document type: PDF`,
    typeof documentContext?.currentPage === 'number' ? `- Current page in viewer: ${documentContext.currentPage}` : '',
    typeof documentContext?.totalPages === 'number' ? `- Total pages: ${documentContext.totalPages}` : '',
    documentContext?.focus ? `- Focus: ${documentContext.focus}` : '',
    hasImages
      ? `- Attached page images: ${images.map((image) => image.label || (typeof image.pageNumber === 'number' ? `${image.pageNumber}페이지` : 'page image')).join(', ')}`
      : '',
    pageBlocks ? '' : 'Use the attached page images as primary evidence when text context is missing or sparse.',
    pageBlocks,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildPrompt(
  input: string,
  messages: ChatApiMessage[],
  documentContext?: ChatDocumentContext,
  images?: ChatImageAttachment[],
) {
  const recentMessages = messages.slice(-12);
  const transcript = recentMessages
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
    .join('\n\n');

  return [
    'You are helping a user read and understand a document in a study workspace.',
    'Answer clearly and use Markdown when useful.',
    'When document context is provided, use it as the primary evidence for your answer.',
    'Answer naturally. Do not mention internal retrieval, hidden context, prompt construction, or implementation details unless the user explicitly asks about them.',
    buildDocumentContextSection(documentContext, images),
    transcript ? `Conversation so far:\n\n${transcript}` : '',
    `Latest user request:\n\n${input}`,
  ]
    .filter(Boolean)
    .join('\n\n');
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
      .sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER))
      .map((model) => ({
        id: model.slug,
        display_name: model.display_name || model.slug,
        owned_by: 'codex',
        created: 0,
      }));
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

export async function runCodexTurn(
  input: string,
  messages: ChatApiMessage[],
  model?: string,
  documentContext?: ChatDocumentContext,
  images?: ChatImageAttachment[],
): Promise<ChatCompletionResponse> {
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

  let imageTempDir: string | undefined;

  try {
    if (Array.isArray(images) && images.length > 0) {
      const writtenImages = await writeImageAttachments(images);
      imageTempDir = writtenImages.tempDir;
      for (const filePath of writtenImages.filePaths) {
        args.push('--image', filePath);
      }
    }

    args.push('--', buildPrompt(input, messages, documentContext, images));

    const result = await new Promise<{ text: string; model?: string }>((resolve, reject) => {
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

    return {
      provider: 'codex',
      model: result.model,
      text: result.text,
    };
  } finally {
    if (imageTempDir) {
      await fs.rm(imageTempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function validateCodexConnection(model?: string): Promise<ProviderValidationResponse> {
  const result = await runCodexTurn(
    'Reply with exactly OK.',
    [{ role: 'user', content: 'Reply with exactly OK.' }],
    model,
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
    documentContext: normalizeDocumentContext(payload.documentContext),
  };
}
