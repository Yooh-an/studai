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

test('normalizes prose plus naked inline math suffix', () => {
  const input = '토큰 인덱스가 (i)일 때, 해당 토큰의 벡터는 e_i = E[i]';
  const output = normalizeAssistantMarkdown(input);

  assert.equal(output, '토큰 인덱스가 (i)일 때, 해당 토큰의 벡터는 $e_i = E[i]$');
});

test('normalizes prose plus naked display math block', () => {
  const input = ['원-핫 벡터 관점으로 보기 x_i \\in {0,1}^V,\\quad x_i[j]=', '\\begin{cases} 1 & (j=i) \\\\ 0 & (j\\neq i) \\end{cases}', 'e_i = x_i E'].join('\n');
  const output = normalizeAssistantMarkdown(input);

  assert.equal(
    output,
    ['원-핫 벡터 관점으로 보기', '', '$$', 'x_i \\in {0,1}^V,\\quad x_i[j]=', '\\begin{cases} 1 & (j=i) \\\\ 0 & (j\\neq i) \\end{cases}', 'e_i = x_i E', '$$'].join('\n'),
  );
});

test('normalizes parenthesized inline math in section headings without swallowing prose', () => {
  const input = '2. (e_i = E[i])가 뜻하는 것';
  const output = normalizeAssistantMarkdown(input);

  assert.equal(output, '2. ($e_i = E[i]$)가 뜻하는 것');
});

test('normalizes comma-separated math sequences and wrapped declarations', () => {
  const input = [
    '- 토큰 ID: ((i_1, i_2, i_3, i_4))',
    '',
    '[ E[i_1], E[i_2], E[i_3], E[i_4] ]',
    '',
    '[ Z \\in \\mathbb{R}^{T \\times d} ]',
    '',
    '[ h_t^{(0)} = E[i_t] + P[t] ]',
  ].join('\n');
  const output = normalizeAssistantMarkdown(input);

  assert.equal(
    output,
    [
      '- 토큰 ID: ($i_1, i_2, i_3, i_4$)',
      '',
      '$E[i_1], E[i_2], E[i_3], E[i_4]$',
      '',
      '$Z \\in \\mathbb{R}^{T \\times d}$',
      '',
      '$h_t^{(0)} = E[i_t] + P[t]$',
    ].join('\n'),
  );
});

test('normalizes screenshot-like mixed math response coherently', () => {
  const input = [
    '1. 토큰 임베딩 행렬 E \\in \\mathbb{R}^{V \\times d}',
    '',
    '- (V): 단어/토큰 사전 크기',
    '- (d): 임베딩 차원 (예: 768)',
    '',
    '2. 토큰 하나의 임베딩 꺼내기',
    '',
    '- 토큰 인덱스가 (i)일 때, 해당 토큰의 벡터는 [ e_i = E[i] ] (행 인덱스 (i)번째 행을 꺼내는 것)',
    '',
    '3. 원-핫 벡터 관점으로 보기 [',
    'x_i \\in {0,1}^V,\\quad x_i[j]=',
    '\\begin{cases} 1 & (j=i) \\\\ 0 & (j\\neq i) \\end{cases}',
    '] [ e_i = x_i E ]',
  ].join('\n');

  const output = normalizeAssistantMarkdown(input);

  assert.ok(output.includes('1. 토큰 임베딩 행렬 $E \\in \\mathbb{R}^{V \\times d}$'));
  assert.ok(output.includes('해당 토큰의 벡터는 $e_i = E[i]$'));
  assert.ok(output.includes('$$\nx_i \\in {0,1}^V,\\quad x_i[j]='));
  assert.ok(output.includes('e_i = x_i E\n$$'));
  assert.ok(!output.includes('] ['));
});
