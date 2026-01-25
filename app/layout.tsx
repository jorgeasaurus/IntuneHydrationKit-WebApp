import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { MsalProvider } from "@/components/auth/MsalProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { WizardProvider } from "@/hooks/useWizardState";
import { SettingsProvider } from "@/hooks/useSettings";
import { Toaster } from "@/components/ui/sonner";
import { AnimatedGridBackground } from "@/components/ui/animated-grid-background";

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
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <MsalProvider>
            <SettingsProvider>
              <WizardProvider>
                <AnimatedGridBackground />
                {children}
                <Toaster />
              </WizardProvider>
            </SettingsProvider>
          </MsalProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
