export const metadata = {
  title: "SBI Telemetry",
  description: "SBI skill-usage telemetry collector",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
