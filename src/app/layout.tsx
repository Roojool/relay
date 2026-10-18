import type { Metadata } from 'next';
import './globals.css';
import './dashboard.css';
import './setup.css';

export const metadata: Metadata = {
  title: 'Relay — Freight Handoff Relay Desk',
  description: 'Prove every shipment leg hands off to a legal, awake, certified driver — on a FalkorDB graph.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="pact-app-layout antialiased font-sans bg-paper-base text-ink-primary">
        {children}
      </body>
    </html>
  );
}
