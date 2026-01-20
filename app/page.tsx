"use client";

import { useState } from "react";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  ArrowRight,
  UserCircle,
  Settings,
  Play,
  Download,
  HelpCircle,
} from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { CloudEnvironmentSelector } from "@/components/CloudEnvironmentSelector";
import { CloudEnvironment } from "@/types/hydration";
import { useWizardState } from "@/hooks/useWizardState";

export default function Home() {
  const isAuthenticated = useIsAuthenticated();
  const router = useRouter();
  const { resetWizard } = useWizardState();
  const [showCloudSelector, setShowCloudSelector] = useState(false);

  const handleSignInClick = () => {
    setShowCloudSelector(true);
  };

  const handleCloudSelect = async (environment: CloudEnvironment) => {
    setShowCloudSelector(false);
    try {
      await signIn(environment);
      toast.success("Successfully signed in!");
      resetWizard();
      router.push("/wizard");
    } catch (error) {
      toast.error("Failed to sign in. Please try again.");
      console.error("Sign in error:", error);
    }
  };

  const handleCloudSelectorCancel = () => {
    setShowCloudSelector(false);
  };

  const handleContinue = () => {
    resetWizard();
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
            Deploy up to 900+ Microsoft Intune best-practice policies, groups, filters, and more.
            Select only what you need. Zero hassle.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            {!isAuthenticated ? (
              <Button onClick={handleSignInClick} size="lg" className="text-lg px-8 text-white">
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
          </div>

          <CloudEnvironmentSelector
            open={showCloudSelector}
            onSelect={handleCloudSelect}
            onCancel={handleCloudSelectorCancel}
          />
          <p className="text-sm text-muted-foreground pt-2">
            Prefer PowerShell?{" "}
            <a
              href="https://github.com/jorgeasaurus/IntuneHydrationKit"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Check out the PowerShell module
              <ArrowRight className="h-3 w-3" />
            </a>
          </p>
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
                  Deploy 900+ policies, groups, filters, and conditional access policies in under 10 minutes.
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
                        98 OpenIntuneBaseline policies
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        728 CIS security benchmarks
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        10 Compliance policies
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        10 App protection policies
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
                        47 Device groups
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        24 Assignment filters
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        3 Enrollment profiles
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Platform-specific targeting
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

      {/* FAQ Section */}
      <section id="faq" className="container mx-auto px-4 py-16 scroll-mt-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-4">
              <HelpCircle className="h-8 w-8 text-primary" />
              <h2 className="text-3xl sm:text-4xl font-bold">Frequently Asked Questions</h2>
            </div>
            <p className="text-lg text-muted-foreground">
              Common questions about the Intune Hydration Kit
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>Is this tool safe to use in production?</AccordionTrigger>
              <AccordionContent>
                Yes. The tool includes multiple safety features: all created objects are marked with
                &quot;Imported by Intune Hydration Kit&quot; in their description, delete operations only remove
                objects with this marker, and Conditional Access policies are created in a disabled state
                so you can review them before enabling. We recommend testing in a dev/test tenant first.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger>What permissions do I need?</AccordionTrigger>
              <AccordionContent>
                You need to be a Global Administrator or Intune Administrator with the ability to consent
                to the required Microsoft Graph API permissions. The permissions include read/write access
                to device management configurations, groups, policies, and conditional access. Admin consent
                is required during sign-in.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3">
              <AccordionTrigger>What licenses are required?</AccordionTrigger>
              <AccordionContent>
                At minimum, you need an Intune license (included in Microsoft 365 E3/E5, Business Premium,
                or standalone Intune). For risk-based Conditional Access policies, Azure AD Premium P2 is
                required. For Windows Driver Update profiles, Windows E3/E5 or equivalent is needed. The
                tool will automatically skip features that require licenses you don&apos;t have.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4">
              <AccordionTrigger>Can I undo or rollback changes?</AccordionTrigger>
              <AccordionContent>
                Yes. Use the Delete operation mode to remove all objects created by this tool. The delete
                operation only removes objects that have the hydration kit marker in their description,
                so your existing configurations are safe. Note that Conditional Access policies must be
                in a disabled state to be deleted.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5">
              <AccordionTrigger>What is OpenIntuneBaseline?</AccordionTrigger>
              <AccordionContent>
                OpenIntuneBaseline is an open-source community project that provides 70+ security and
                configuration policies for Windows and macOS. These policies follow Microsoft&apos;s security
                recommendations and industry best practices. The Intune Hydration Kit can automatically
                download and deploy the latest baseline from GitHub.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-6">
              <AccordionTrigger>Does this work with government cloud environments?</AccordionTrigger>
              <AccordionContent>
                Yes. The tool supports multiple cloud environments including Global (Commercial),
                US Government (GCC High), US Government DoD, Germany, and China (21Vianet). Select
                your cloud environment during the tenant configuration step.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-7">
              <AccordionTrigger>How long does the hydration process take?</AccordionTrigger>
              <AccordionContent>
                A full deployment of all 900+ objects typically takes 10-30 minutes. The tool processes
                tasks sequentially to avoid API throttling and includes automatic retry logic for
                transient errors. You can monitor progress in real-time on the dashboard.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-8">
              <AccordionTrigger>What happens if an object already exists?</AccordionTrigger>
              <AccordionContent>
                In Create mode, the tool checks for existing objects by name before creating new ones.
                If an object with the same name already exists, it will be skipped and marked as
                &quot;Skipped&quot; in the results. This prevents duplicates and ensures idempotent operations.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
                  <Button onClick={handleSignInClick} size="lg" className="text-lg px-8 text-white">
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
                href="https://github.com/skiptotheendpoint/OpenIntuneBaseline"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                OpenIntuneBaseline
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
