import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Slack Coworker",
  description: "An AI coworker for your Slack workspace, powered by the ai-employee SDK.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "2rem" }}>
        {children}
      </body>
    </html>
  );
}
