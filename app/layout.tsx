import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./landing.css";
import { MsalProvider } from "@/components/auth/MsalProvider";
import { WizardProvider } from "@/hooks/useWizardState";
import { SettingsProvider } from "@/hooks/useSettings";
import { Toaster } from "@/components/ui/sonner";
import { RouteWallpaper } from "@/components/RouteWallpaper";
import { StructuredData } from "@/components/seo/StructuredData";
import { SITE_URL } from "@/lib/siteUrl";
import { Analytics } from "@vercel/analytics/next";
import { ExecutionRouteGuard } from "@/components/dashboard/ExecutionRouteGuard";

// Fonts are self-hosted (latin subset, variable weight) so the build does not
// fetch from Google Fonts. The files and their OFL licences are in app/fonts.

// DM Sans - Geometric, bold display font
const dmSans = localFont({
  src: "./fonts/dm-sans-latin-wght-normal.woff2",
  variable: "--font-dm-sans",
  display: "swap",
  weight: "100 1000",
  style: "normal",
});

// JetBrains Mono - Technical, precise monospace for data displays
const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: "100 800",
  style: "normal",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Intune Hydration Kit — Bootstrap Microsoft Intune Tenants Fast",
    template: "%s | Intune Hydration Kit",
  },
  description:
    "Bootstrap Microsoft Intune tenants with OpenIntuneBaseline policies, compliance, and conditional access — deployed via Microsoft Graph with preview mode and safety checks.",
  keywords: [
    "Microsoft Intune",
    "Intune setup",
    "OpenIntuneBaseline",
    "Intune compliance policies",
    "conditional access",
    "Microsoft Graph",
    "Intune tenant bootstrap",
    "device management",
  ],
  alternates: {
    canonical: "/",
  },
  // Favicon and apple-touch icon are provided by the app/icon.png and
  // app/apple-icon.png file conventions; the web app manifest by app/manifest.ts.
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Intune Hydration Kit",
    title: "Intune Hydration Kit — Bootstrap Microsoft Intune Tenants Fast",
    description:
      "Bootstrap Microsoft Intune tenants with OpenIntuneBaseline policies, compliance, and conditional access — deployed via Microsoft Graph with preview mode and safety checks.",
    images: [
      {
        url: "/SocialCard.jpg",
        width: 1200,
        height: 630,
        alt: "Intune Hydration Kit social preview card",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Intune Hydration Kit — Bootstrap Microsoft Intune Tenants Fast",
    description:
      "Bootstrap Microsoft Intune tenants with OpenIntuneBaseline policies, compliance, and conditional access — deployed via Microsoft Graph with preview mode and safety checks.",
    images: ["/SocialCard.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#005588",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {/* JSON-LD for crawlers. It does not need the MSAL context. */}
        <StructuredData />
        <MsalProvider>
          <SettingsProvider>
            <WizardProvider>
              <RouteWallpaper />
              <ExecutionRouteGuard>{children}</ExecutionRouteGuard>
              <Toaster />
              <Analytics />
            </WizardProvider>
          </SettingsProvider>
        </MsalProvider>
      </body>
    </html>
  );
}
