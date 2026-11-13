import type { Metadata } from "next";

// Auth-gated route with tenant data and no SEO value. Keep it out of search indexes.
export const metadata: Metadata = {
  title: "Run history",
  robots: { index: false, follow: false },
};

export default function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
