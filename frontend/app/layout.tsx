import type { Metadata, Viewport } from 'next';
import { Cairo, IBM_Plex_Sans_Arabic } from 'next/font/google';
import './globals.css';

const plex = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['300', '400', '500', '600'], variable: '--font-plex', display: 'swap' });
const cairo = Cairo({ subsets: ['arabic'], weight: ['600', '700', '800'], variable: '--font-cairo', display: 'swap' });

export const metadata: Metadata = {
  title: 'المرشد الأكاديمي · جامعة بوليتكنك فلسطين',
  description: 'اسأل عن التسجيل والغياب والانسحاب والمعدل والتخرج، وخذ الجواب من أنظمة الجامعة مع رقم الصفحة.',
};

export const viewport: Viewport = { themeColor: '#eaf4ff', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${plex.variable} ${cairo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
