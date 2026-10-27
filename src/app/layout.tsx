import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "InternHub", template: "%s · InternHub" },
  description: "Virtual internship workspace — teams, projects, reviews and meetings in one place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
