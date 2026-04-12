import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'StudAI',
  description: 'Local-first study workspace with PDF/EPUB reading and Codex chat.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
