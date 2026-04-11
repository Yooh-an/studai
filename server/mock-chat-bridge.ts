import express from 'express';

const app = express();
const port = Number(process.env.PORT || 8787);

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

app.get('/health', (req, res) => {
  res.json({ ok: true, provider: String(req.query.provider || 'codex'), authenticated: false });
});

app.get('/api/models', (req, res) => {
  const provider = String(req.query.provider || 'codex');

  const models = provider === 'claude'
    ? [
        { id: 'claude-sonnet-mock', display_name: 'Claude Sonnet (Mock)' },
        { id: 'claude-opus-mock', display_name: 'Claude Opus (Mock)' },
      ]
    : [
        { id: 'codex-mock-default', display_name: 'Codex Mock Default' },
        { id: 'codex-mock-reasoning', display_name: 'Codex Mock Reasoning' },
      ];

  res.json({ provider, models });
});

app.post('/api/chat', (req, res) => {
  const { input, messages, provider, model } = req.body ?? {};

  if (typeof input !== 'string' || !input.trim()) {
    res.status(400).json({ error: 'input must be a non-empty string' });
    return;
  }

  const historyCount = Array.isArray(messages) ? messages.length : 0;

  res.json({
    provider: typeof provider === 'string' ? provider : 'codex',
    model: typeof model === 'string' ? model : 'codex-mock-default',
    text: [
      '이 응답은 mock chat bridge에서 생성되었습니다.',
      '',
      `- provider: ${typeof provider === 'string' ? provider : 'codex'}`,
      `- model: ${typeof model === 'string' ? model : 'codex-mock-default'}`,
      `- 최근 입력: ${input.trim()}`,
      `- 전달된 메시지 수: ${historyCount}`,
      '',
      '실제 브리지가 준비되면 `/api/chat`, `/api/models`, `/health` 만 교체하면 됩니다.',
      '현재 구현은 Annot 스타일의 ChatPanel / Settings UX를 테스트하기 위한 안전한 mock 입니다.',
    ].join('\n'),
  });
});

app.listen(port, () => {
  console.log(`Mock chat bridge listening on http://localhost:${port}`);
});
