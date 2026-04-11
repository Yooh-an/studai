import express from 'express';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const app = express();
const port = Number(process.env.PORT || 8787);
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

interface ChatMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  input?: string;
  provider?: SupportedProvider;
  model?: string;
  messages?: ChatMessageInput[];
}

interface ResolvedCommand {
  command: string;
  argsPrefix: string[];
}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

app.use(express.json({ limit: '10mb' }));

function normalizeProvider(value: unknown): SupportedProvider {
  return value === 'claude' ? 'claude' : 'codex';
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

async function getCodexLoginStatus() {
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
      authenticated: /logged in/i.test(output),
      detail: output.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      authenticated: false,
      detail: error instanceof Error ? error.message : 'Failed to query Codex login status',
    };
  }
}

async function fetchCodexModels() {
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

function buildPrompt(input: string, messages: ChatMessageInput[]) {
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

async function runCodexTurn(input: string, messages: ChatMessageInput[], model?: string) {
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
}

app.get('/health', async (req, res) => {
  const provider = normalizeProvider(req.query.provider);

  if (provider !== 'codex') {
    res.json({
      ok: false,
      provider,
      authenticated: false,
      error: 'Only Codex is implemented in the real bridge.',
    });
    return;
  }

  const status = await getCodexLoginStatus();
  res.json({
    ok: status.ok,
    provider,
    authenticated: status.authenticated,
    error: status.ok ? undefined : status.detail,
  });
});

app.get('/api/models', async (req, res) => {
  const provider = normalizeProvider(req.query.provider);

  if (provider !== 'codex') {
    res.json({ provider, models: [] });
    return;
  }

  const models = await fetchCodexModels();
  res.json({ provider, models });
});

app.post('/api/chat', async (req, res) => {
  const { input, provider, model, messages } = (req.body ?? {}) as ChatRequestBody;
  const normalizedProvider = normalizeProvider(provider);

  if (normalizedProvider !== 'codex') {
    res.status(400).json({ error: 'Only Codex is implemented in the real bridge.' });
    return;
  }

  if (typeof input !== 'string' || !input.trim()) {
    res.status(400).json({ error: 'input must be a non-empty string' });
    return;
  }

  try {
    const result = await runCodexTurn(
      input.trim(),
      Array.isArray(messages) ? messages : [],
      typeof model === 'string' && model.trim() ? model : undefined,
    );

    res.json({
      provider: normalizedProvider,
      model: result.model,
      text: result.text,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Codex bridge request failed',
    });
  }
});

app.listen(port, () => {
  console.log(`Codex CLI bridge listening on http://localhost:${port}`);
});
