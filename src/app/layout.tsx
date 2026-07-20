import type { Metadata } from 'next';
import './globals.css';
import { cn } from "@/lib/utils";
import { TooltipProvider } from '@/components/ui/tooltip';
import { GeistSans } from 'geist/font/sans';

export const metadata: Metadata = {
  title: { default: 'Tagvico', template: '%s · Tagvico' },
  description: 'Your private action center and household companion for Paperless-ngx.',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={cn("dark font-sans", GeistSans.variable)}><body><TooltipProvider>{children}</TooltipProvider></body></html>;
}
