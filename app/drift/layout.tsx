import type { Metadata } from "next";

// Auth-gated route with no SEO value — keep it out of search indexes.
export const metadata: Metadata = {
  title: "Drift Scan",
  robots: { index: false, follow: false },
};

export default function DriftLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
