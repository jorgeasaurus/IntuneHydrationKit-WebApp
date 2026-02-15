import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { MsalProvider } from "@/components/auth/MsalProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
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
  title: "Intune Hydration Kit",
  description:
    "Bootstrap Microsoft Intune tenants with best-practice configurations",
  icons: {
    icon: "/IHTLogoClear.png",
    apple: "/IHTLogoClear.png",
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
          enableSystem
          disableTransitionOnChange
        >
          <MsalProvider>
            <SettingsProvider>
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
