"use client";

import { useIsAuthenticated } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signIn } from "@/lib/auth/authUtils";
import { toast } from "sonner";
import {
  Shield,
  Zap,
  Cloud,
  CheckCircle2,
  GitBranch,
  FileCheck,
  Users,
  Filter,
  Lock,
  Github,
  ArrowRight,
  UserCircle,
  Settings,
  Play,
  Download,
} from "lucide-react";
import { Navigation } from "@/components/Navigation";

export default function Home() {
  const isAuthenticated = useIsAuthenticated();
  const router = useRouter();

  const handleSignIn = async () => {
    try {
      await signIn();
      toast.success("Successfully signed in!");
      router.push("/wizard");
    } catch (error) {
      toast.error("Failed to sign in. Please try again.");
      console.error("Sign in error:", error);
    }
  };

  const handleContinue = () => {
    router.push("/wizard");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      <Navigation />
      {/* Hero Section */}
      <section className="container mx-auto px-4 pt-32 pb-16">
        <div className="max-w-5xl mx-auto text-center space-y-6">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-black tracking-tight leading-tight">
            Bootstrap Your Tenant.{" "}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              In Minutes.
            </span>
          </h1>
          <p className="text-xl sm:text-2xl text-muted-foreground max-w-3xl mx-auto">
            Deploy 127+ Microsoft Intune best-practice policies, groups, and filters.
            One click. Zero hassle.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            {!isAuthenticated ? (
              <Button onClick={handleSignIn} size="lg" className="text-lg px-8 text-white">
                <svg className="mr-2 h-5 w-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                </svg>
                Sign In with Microsoft
              </Button>
            ) : (
              <Button onClick={handleContinue} size="lg" className="text-lg px-8">
                Continue to Wizard
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            )}
            <Button
              variant="outline"
              size="lg"
              className="text-lg px-8"
              asChild
            >
              <a
                href="https://github.com/jorgeasaurus/IntuneHydrationKit"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="mr-2 h-5 w-5" />
                View on GitHub
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-4 py-16 scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Features</h2>
            <p className="text-lg text-muted-foreground">
              Everything you need to set up a production-ready Intune environment
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <Shield className="h-10 w-10 mb-3 text-primary" />
                <CardTitle>Safety First</CardTitle>
                <CardDescription>
                  Built-in safeguards with safety markers prevent accidental deletions. Only objects created by this tool can be removed.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <Zap className="h-10 w-10 mb-3 text-primary" />
                <CardTitle>Quick Deployment</CardTitle>
                <CardDescription>
                  Deploy 127+ policies, groups, filters, and conditional access policies in under 10 minutes.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <Cloud className="h-10 w-10 mb-3 text-primary" />
                <CardTitle>Multi-Cloud Support</CardTitle>
                <CardDescription>
                  Works with Global, US Government (GCC High & DoD), Germany, and China (21Vianet) clouds.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <GitBranch className="h-10 w-10 mb-3 text-primary" />
                <CardTitle>Three Operation Modes</CardTitle>
                <CardDescription>
                  Create new configurations, preview changes without applying them, or delete previously created objects.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <FileCheck className="h-10 w-10 mb-3 text-primary" />
                <CardTitle>OpenIntuneBaseline</CardTitle>
                <CardDescription>
                  Integrates with OpenIntuneBaseline for 70+ security and configuration policies maintained by the community.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <CheckCircle2 className="h-10 w-10 mb-3 text-primary" />
                <CardTitle>Pre-flight Validation</CardTitle>
                <CardDescription>
                  Validates licenses, permissions, and tenant health before making any changes to your environment.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="container mx-auto px-4 py-16 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-lg text-muted-foreground">
              Four simple steps to a fully configured Intune tenant
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <UserCircle className="h-8 w-8 text-primary" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  1
                </div>
              </div>
              <h3 className="text-xl font-semibold">Sign In</h3>
              <p className="text-sm text-muted-foreground">
                Authenticate with your Microsoft account and connect to your Intune tenant
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Settings className="h-8 w-8 text-primary" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  2
                </div>
              </div>
              <h3 className="text-xl font-semibold">Configure</h3>
              <p className="text-sm text-muted-foreground">
                Select what you want to deploy: policies, groups, filters, or conditional access
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Play className="h-8 w-8 text-primary" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  3
                </div>
              </div>
              <h3 className="text-xl font-semibold">Deploy</h3>
              <p className="text-sm text-muted-foreground">
                Review your selections and deploy configurations to your tenant with one click
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Download className="h-8 w-8 text-primary" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  4
                </div>
              </div>
              <h3 className="text-xl font-semibold">Export</h3>
              <p className="text-sm text-muted-foreground">
                Download detailed reports and review what was deployed to your environment
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What Gets Deployed Section */}
      <section id="what-gets-deployed" className="container mx-auto px-4 py-16 scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              What Gets Deployed
            </h2>
            <p className="text-lg text-muted-foreground">
              Comprehensive coverage of Intune configuration objects
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FileCheck className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="mb-2">Policies & Baselines</CardTitle>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        70+ Security baselines
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        8 App protection policies
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        17 Mobile apps
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Notification templates
                      </li>
                    </ul>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="mb-2">Groups & Targeting</CardTitle>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        43 Dynamic device groups
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        24 Assignment filters
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Platform-specific targeting
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Enrollment profiles
                      </li>
                    </ul>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Lock className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="mb-2">Zero Trust</CardTitle>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        21 Conditional Access policies
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Created in disabled state
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Manual review required
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Production-ready templates
                      </li>
                    </ul>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Filter className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="mb-2">Customization</CardTitle>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Select specific categories
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Custom baseline repository
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Preview before deployment
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Detailed execution reports
                      </li>
                    </ul>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Required Permissions Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <Card className="border-2 border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30">
            <CardHeader>
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                  <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-2xl mb-2">Required Microsoft Graph Permissions</CardTitle>
                  <CardDescription className="text-base">
                    These delegated scopes are required to read policies, assignments, groups, filters, and related Intune objects.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <code className="px-3 py-2 rounded-md bg-white dark:bg-slate-900 text-xs font-mono border">
                  DeviceManagementConfiguration.ReadWrite.All
                </code>
                <code className="px-3 py-2 rounded-md bg-white dark:bg-slate-900 text-xs font-mono border">
                  DeviceManagementServiceConfig.ReadWrite.All
                </code>
                <code className="px-3 py-2 rounded-md bg-white dark:bg-slate-900 text-xs font-mono border">
                  DeviceManagementManagedDevices.ReadWrite.All
                </code>
                <code className="px-3 py-2 rounded-md bg-white dark:bg-slate-900 text-xs font-mono border">
                  DeviceManagementScripts.ReadWrite.All
                </code>
                <code className="px-3 py-2 rounded-md bg-white dark:bg-slate-900 text-xs font-mono border">
                  DeviceManagementApps.ReadWrite.All
                </code>
                <code className="px-3 py-2 rounded-md bg-white dark:bg-slate-900 text-xs font-mono border">
                  Group.ReadWrite.All
                </code>
                <code className="px-3 py-2 rounded-md bg-white dark:bg-slate-900 text-xs font-mono border">
                  Policy.Read.All
                </code>
                <code className="px-3 py-2 rounded-md bg-white dark:bg-slate-900 text-xs font-mono border">
                  Policy.ReadWrite.ConditionalAccess
                </code>
                <code className="px-3 py-2 rounded-md bg-white dark:bg-slate-900 text-xs font-mono border">
                  Application.Read.All
                </code>
                <code className="px-3 py-2 rounded-md bg-white dark:bg-slate-900 text-xs font-mono border">
                  Directory.ReadWrite.All
                </code>
                <code className="px-3 py-2 rounded-md bg-white dark:bg-slate-900 text-xs font-mono border">
                  LicenseAssignment.Read.All
                </code>
                <code className="px-3 py-2 rounded-md bg-white dark:bg-slate-900 text-xs font-mono border">
                  Organization.Read.All
                </code>
              </div>
              <div className="mt-4 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                <p className="text-sm ">
                  <strong>Note:</strong> Admin consent is required for these permissions. Accept these during signing in.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader className="text-center space-y-4 pb-8">
              <CardTitle className="text-3xl">
                Ready to Bootstrap Your Intune Tenant?
              </CardTitle>
              <CardDescription className="text-lg">
                Sign in with your Microsoft account and start the guided wizard
              </CardDescription>
              <div className="pt-4">
                {!isAuthenticated ? (
                  <Button onClick={handleSignIn} size="lg" className="text-lg px-8 text-white">
                    <svg className="mr-2 h-5 w-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                      <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                      <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                    </svg>
                    Get Started Now
                  </Button>
                ) : (
                  <Button onClick={handleContinue} size="lg" className="text-lg px-8">
                    Continue to Wizard
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                )}
              </div>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t mt-16 py-8">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} IntuneHydrationKit. Open source under MIT License.
            </div>
            <div className="flex gap-6 text-sm">
              <a
                href="https://github.com/jorgeasaurus/IntuneHydrationKit"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                PowerShell Module
              </a>
              <a
                href="https://github.com/jorgeasaurus/OpenIntuneBaseline"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                OpenIntuneBaseline (Maintained Fork)
              </a>
              <a
                href="https://learn.microsoft.com/en-us/graph/api/overview"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Microsoft Graph
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
