import { NextRequest, NextResponse } from 'next/server';

import { getProviderRuntime } from '@/src/lib/server/providers';
import { normalizeProvider, parseChatRequestBody } from '@/src/lib/server/codex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const request = parseChatRequestBody(await req.json());
    const provider = normalizeProvider(request.provider);

    if (!request.input.trim()) {
      return NextResponse.json({ error: 'input must be a non-empty string' }, { status: 400 });
    }

    const result = await getProviderRuntime(provider).runTurn({
      ...request,
      provider,
      input: request.input.trim(),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat request failed' },
      { status: 500 },
    );
  }
}
