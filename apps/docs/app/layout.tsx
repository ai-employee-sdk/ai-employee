import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'AI Employee SDK',
    template: '%s | AI Employee SDK',
  },
  description: 'Composable autonomy primitives for the Vercel AI SDK. Permissions, cost tracking, server-side interrupts.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen font-sans">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
