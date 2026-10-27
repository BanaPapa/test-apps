import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '아파트 실거래가',
  description: '국토교통부 실거래가 공개 데이터로 만든 개인용 도구',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
