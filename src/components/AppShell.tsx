'use client';

import dynamic from 'next/dynamic';

const App = dynamic(() => import('../App'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500">
      Loading StudAI…
    </div>
  ),
});

export function AppShell() {
  return <App />;
}
