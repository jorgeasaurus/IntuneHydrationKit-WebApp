import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./landing.css";
import { MsalProvider } from "@/components/auth/MsalProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { SettingsThemeSync } from "@/components/providers/SettingsThemeSync";
import { WizardProvider } from "@/hooks/useWizardState";
import { SettingsProvider } from "@/hooks/useSettings";
import { Toaster } from "@/components/ui/sonner";
import { RouteWallpaper } from "@/components/RouteWallpaper";
import { StructuredData } from "@/components/seo/StructuredData";
import { SITE_URL } from "@/lib/siteUrl";
import { Analytics } from "@vercel/analytics/next";

// DM Sans - Geometric, bold display font
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

// JetBrains Mono - Technical, precise monospace for data displays
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["400", "500", "600", "700"],
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
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        {/* Rendered outside MsalProvider (which gates SSR) so the JSON-LD is
            always present in the server HTML for crawlers. */}
        <StructuredData />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          themes={["light", "dark", "corporate-1999"]}
          enableSystem
          disableTransitionOnChange
        >
          <MsalProvider>
            <SettingsProvider>
              <SettingsThemeSync />
              <WizardProvider>
                <RouteWallpaper />
                {children}
                <Toaster />
                <Analytics />
              </WizardProvider>
            </SettingsProvider>
          </MsalProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
