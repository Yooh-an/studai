import { NextRequest, NextResponse } from 'next/server';

import { getProviderRuntime } from '@/src/lib/server/providers';
import { normalizeProvider } from '@/src/lib/server/codex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const provider = normalizeProvider(req.nextUrl.searchParams.get('provider'));
    const models = await getProviderRuntime(provider).listModels();
    return NextResponse.json({ provider, models });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch models' },
      { status: 500 },
    );
  }
}
