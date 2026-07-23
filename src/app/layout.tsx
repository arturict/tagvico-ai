import type { Metadata } from 'next';
import './globals.css';
import { cn } from "@/lib/utils";
import { TooltipProvider } from '@/components/ui/tooltip';
import { GeistSans } from 'geist/font/sans';

export const metadata: Metadata = {
  applicationName: 'Tagvico AI',
  title: { default: 'Tagvico AI', template: '%s | Tagvico AI' },
  description: 'Your private action center and household companion for Paperless-ngx.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/tagvico-icon.png', type: 'image/png' }
    ],
    apple: '/tagvico-icon.png'
  },
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={cn("dark font-sans", GeistSans.variable)}><body><TooltipProvider>{children}</TooltipProvider></body></html>;
}
