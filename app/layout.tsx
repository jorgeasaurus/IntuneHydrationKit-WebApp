import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { MsalProvider } from "@/components/auth/MsalProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { SettingsThemeSync } from "@/components/providers/SettingsThemeSync";
import { WizardProvider } from "@/hooks/useWizardState";
import { SettingsProvider } from "@/hooks/useSettings";
import { Toaster } from "@/components/ui/sonner";
import { IndustrialBackground } from "@/components/IndustrialBackground";
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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://intunehydrationkit.com"
  ),
  title: "Intune Hydration Kit",
  description:
    "Bootstrap Microsoft Intune tenants with best-practice configurations",
  icons: {
    icon: "/IHTLogoClear.png",
    apple: "/IHTLogoClear.png",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Intune Hydration Kit",
    title: "Intune Hydration Kit",
    description:
      "Bootstrap Microsoft Intune tenants with best-practice configurations",
    images: [
      {
        url: "/SocialCard.png",
        width: 1211,
        height: 636,
        alt: "Intune Hydration Kit social preview card",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Intune Hydration Kit",
    description:
      "Bootstrap Microsoft Intune tenants with best-practice configurations",
    images: ["/SocialCard.png"],
  },
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
                <IndustrialBackground />
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
