export const metadata = {
  title: 'Voice Chat AI',
  description: 'Real-time voice and text chat'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
