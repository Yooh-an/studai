import { NextRequest, NextResponse } from 'next/server';

import { getProviderRuntime } from '@/src/lib/server/providers';
import { normalizeProvider } from '@/src/lib/server/codex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const provider = normalizeProvider(req.nextUrl.searchParams.get('provider'));
    const status = await getProviderRuntime(provider).getStatus();
    return NextResponse.json(status, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const provider = normalizeProvider(req.nextUrl.searchParams.get('provider'));
    return NextResponse.json(
      {
        ok: false,
        provider,
        authenticated: false,
        error: error instanceof Error ? error.message : 'Failed to load provider status',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
