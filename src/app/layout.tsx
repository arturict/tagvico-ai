import type { Metadata, Viewport } from 'next';
import './globals.css';
import './styles/foundation.css';
import './styles/shell.css';
import './styles/chat.css';
import './styles/inbox.css';
import './styles/settings.css';
import './styles/model-picker.css';
import './styles/pages.css';
import './styles/mascot.css';
import './styles/touches.css';
import { TooltipProvider } from '@/components/ui/tooltip';

export const metadata: Metadata = {
  applicationName: 'Tagvico AI',
  title: { default: 'Tagvico', template: '%s · Tagvico' },
  description: 'A calmer, private workspace for Paperless-ngx.',
  icons: {
    icon: [
      // The .ico holds bitmaps from 16 to 256 px; declaring the sizes makes tabs pick one of them instead of scaling the 512 px PNG down.
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/tagvico-icon.png', type: 'image/png', sizes: '512x512' }
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
