import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChatDocumentContext } from '../chatApi';
import { parseChatRequestBody, shouldRewriteAnswerFromDocumentEvidence } from './codex';

const currentPageContext: ChatDocumentContext = {
  kind: 'pdf',
  currentPage: 12,
  totalPages: 200,
  focus: '현재 페이지',
  pages: [
    {
      pageNumber: 12,
      text: 'embed_tokens has 32,064 rows and hidden size 3,072. lm_head also maps from 3,072 back to 32,064 logits.',
    },
  ],
};

test('requests grounded rewrite when a page-specific answer swaps in generic numbers', () => {
  assert.equal(
    shouldRewriteAnswerFromDocumentEvidence({
      input: '이 페이지에서 말하는 임베딩 행렬 크기를 구체적으로 설명해줘',
      responseText: '예를 들어 $W_E \in \mathbb{R}^{30000 \times 768}$ 로 이해하면 됩니다.',
      documentContext: currentPageContext,
    }),
    true,
  );
});

test('does not request grounded rewrite when the answer uses evidence numbers', () => {
  assert.equal(
    shouldRewriteAnswerFromDocumentEvidence({
      input: '이 페이지에서 말하는 임베딩 행렬 크기를 구체적으로 설명해줘',
      responseText: '이 페이지 기준으로 $W_E \in \mathbb{R}^{32,064 \times 3,072}$ 로 볼 수 있습니다.',
      documentContext: currentPageContext,
    }),
    false,
  );
});

test('requests rewrite when likely latex is left inside square brackets', () => {
  assert.equal(
    shouldRewriteAnswerFromDocumentEvidence({
      input: '이 페이지 수식을 그대로 설명해줘',
      responseText: '[ W_E \\in \\mathbb{R}^{32,064 \\times 3,072} ]',
      documentContext: currentPageContext,
    }),
    true,
  );
});

test('requests rewrite for legacy latex delimiters even without document evidence', () => {
  assert.equal(
    shouldRewriteAnswerFromDocumentEvidence({
      input: '은닉벡터 개념이 뭐야?',
      responseText: '보통 \\(h_t\\)를 은닉벡터라고 쓰고, \\[ z_t = h_t W_{\\text{LM}} + b \\] 로 표현합니다.',
    }),
    true,
  );
});

test('requests rewrite for bare latex commands outside markdown math', () => {
  assert.equal(
    shouldRewriteAnswerFromDocumentEvidence({
      input: 'softmax 수식 보여줘',
      responseText: '최종 확률은 \\mathrm{softmax}(z_t) 로 계산합니다.',
    }),
    true,
  );
});

test('parseChatRequestBody keeps valid reasoning and fast flags', () => {
  const parsed = parseChatRequestBody({
    input: '테스트',
    messages: [{ role: 'user', content: '테스트' }],
    provider: 'codex',
    model: 'gpt-5.4',
    reasoningEffort: 'high',
    useFastModel: true,
  });

  assert.equal(parsed.reasoningEffort, 'high');
  assert.equal(parsed.useFastModel, true);
});

test('parseChatRequestBody ignores invalid reasoning values', () => {
  const parsed = parseChatRequestBody({
    input: '테스트',
    messages: [{ role: 'user', content: '테스트' }],
    reasoningEffort: 'default',
    useFastModel: 'yes',
  });

  assert.equal(parsed.reasoningEffort, undefined);
  assert.equal(parsed.useFastModel, false);
});
