import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Ride — Indoor Cycling',
  description: 'Simulador de ciclismo indoor com conexão BLE a smart trainers e sensores.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
