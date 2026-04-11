import { NextRequest, NextResponse } from 'next/server';

import { getProviderRuntime } from '@/src/lib/server/providers';
import { normalizeProvider } from '@/src/lib/server/codex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { provider?: string; model?: string };
    const provider = normalizeProvider(body?.provider);
    const result = await getProviderRuntime(provider).validateConnection(body?.model);

    return NextResponse.json(result, {
      status: result.ok ? 200 : 400,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        provider: 'codex',
        message: error instanceof Error ? error.message : 'Provider validation failed.',
      },
      { status: 500 },
    );
  }
}
