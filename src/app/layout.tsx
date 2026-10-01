import type { Metadata, Viewport } from 'next';
import './globals.css';
import './styles/foundation.css';
import './styles/shell.css';
import './styles/chat.css';
import './styles/inbox.css';
import './styles/settings.css';
import './styles/pages.css';
import { TooltipProvider } from '@/components/ui/tooltip';

export const metadata: Metadata = {
  applicationName: 'Tagvico AI',
  title: { default: 'Tagvico', template: '%s | Tagvico' },
  description: 'A calmer, private workspace for Paperless-ngx.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/tagvico-icon.png', type: 'image/png' }
    ],
    apple: '/tagvico-icon.png'
  },
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  themeColor: '#ffffff'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="font-sans"><body><TooltipProvider>{children}</TooltipProvider></body></html>;
}
