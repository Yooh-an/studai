import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAssistantMarkdown } from './normalizeAssistantMarkdown';

test('normalizes bracketed inline latex into inline math', () => {
  const input = '토큰 임베딩 행렬 [ E \\in \\mathbb{R}^{V \\times d} ]';
  const output = normalizeAssistantMarkdown(input);

  assert.equal(output, '토큰 임베딩 행렬 $E \\in \\mathbb{R}^{V \\times d}$');
});

test('normalizes latex environments into display math', () => {
  const input = '\\begin{bmatrix} E[i_1] \\\\ \\vdots \\\\ E[i_T] \\end{bmatrix}';
  const output = normalizeAssistantMarkdown(input);

  assert.equal(output, '$$\n\\begin{bmatrix} E[i_1] \\\\ \\vdots \\\\ E[i_T] \\end{bmatrix}\n$$');
});

test('keeps fenced code blocks untouched', () => {
  const input = ['```python', 'x_i = E[i]', '```'].join('\n');
  const output = normalizeAssistantMarkdown(input);

  assert.equal(output, input);
});

test('does not modify plain prose in square brackets', () => {
  const input = '이건 [참고] 표시일 뿐입니다.';
  const output = normalizeAssistantMarkdown(input);

  assert.equal(output, input);
});

test('normalizes multiline bracket blocks without leaving stray brackets', () => {
  const input = ['4. 문장 전체 임베딩 시퀀스라면 [', 'Z =', '\\begin{bmatrix} E[i_1] \\\\ E[i_2] \\\\ \\vdots \\\\ E[i_T] \\end{bmatrix} \\in \\mathbb{R}^{T \\times d}', ']'].join('\n');
  const output = normalizeAssistantMarkdown(input);

  assert.equal(
    output,
    ['4. 문장 전체 임베딩 시퀀스라면', '', '$$', 'Z =', '\\begin{bmatrix} E[i_1] \\\\ E[i_2] \\\\ \\vdots \\\\ E[i_T] \\end{bmatrix} \\in \\mathbb{R}^{T \\times d}', '$$'].join('\n'),
  );
  assert.ok(!/\n\s*\[\s*(?=\n|$)/.test(output));
  assert.ok(!/\n\s*\]\s*(?=\n|$)/.test(output));
});

test('normalizes bracket-wrapped existing inline math cleanly', () => {
  const input = '해당 토큰의 벡터는 [ $e_i = E[i]$ ] 입니다.';
  const output = normalizeAssistantMarkdown(input);

  assert.equal(output, '해당 토큰의 벡터는 $e_i = E[i]$ 입니다.');
});

test('normalizes bracketed math containing index access without splitting at inner brackets', () => {
  const input = '원-핫 벡터 관점에서 [ e_i = x_i E[i] ] 를 볼 수 있습니다.';
  const output = normalizeAssistantMarkdown(input);

  assert.equal(output, '원-핫 벡터 관점에서 $e_i = x_i E[i]$ 를 볼 수 있습니다.');
});
