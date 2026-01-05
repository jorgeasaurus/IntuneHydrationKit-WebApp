import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MsalProvider } from "@/components/auth/MsalProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { WizardProvider } from "@/hooks/useWizardState";
import { SettingsProvider } from "@/hooks/useSettings";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Intune Hydration Kit",
  description:
    "Bootstrap Microsoft Intune tenants with best-practice configurations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <MsalProvider>
            <SettingsProvider>
              <WizardProvider>
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
