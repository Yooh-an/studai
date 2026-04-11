import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import type { ModelOption } from '../../types/ai';
import type {
  ChatApiMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
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

function buildPrompt(input: string, messages: ChatApiMessage[]) {
  const recentMessages = messages.slice(-12);
  const transcript = recentMessages
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
    .join('\n\n');

  return [
    'You are helping a user read and understand a document in a study workspace.',
    'Answer clearly and use Markdown when useful.',
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

export async function runCodexTurn(
  input: string,
  messages: ChatApiMessage[],
  model?: string,
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

  args.push(buildPrompt(input, messages));

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
    imageBase64: typeof payload.imageBase64 === 'string' ? payload.imageBase64 : undefined,
    provider: normalizeProvider(payload.provider),
    model: typeof payload.model === 'string' && payload.model.trim() ? payload.model : undefined,
  };
}
