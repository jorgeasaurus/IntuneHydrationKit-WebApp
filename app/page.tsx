"use client";

import { useState } from "react";
import { useIsAuthenticated } from "@azure/msal-react";
import { useRouter } from "next/navigation";
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
import { AnimatedCounter } from "@/components/ui/animated-counter";
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
  ArrowRight,
  UserCircle,
  Settings,
  Play,
  Download,
  HelpCircle,
} from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { CloudEnvironmentSelector } from "@/components/CloudEnvironmentSelector";
import { GradientBackground } from "@/components/GradientBackground";
import { WizardDemo } from "@/components/WizardDemo";
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
    <div className="min-h-screen relative">
      <GradientBackground />
      <div className="relative z-10">
        <Navigation />
      {/* Hero Section */}
      <section className="container mx-auto px-4 pt-32 pb-16">
        <div className="max-w-5xl mx-auto text-center space-y-6">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-black tracking-tight leading-tight">
            Bootstrap Your Tenant.{" "}
            <span className="gradient-text-animated">
              In Minutes.
            </span>
          </h1>
          <p className="text-xl sm:text-2xl text-muted-foreground max-w-3xl mx-auto">
            Deploy up to 930 Microsoft Intune best-practice policies, groups, filters, and more.
            Select only what you need. Zero hassle.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            {!isAuthenticated ? (
              <Button onClick={handleSignInClick} size="lg" className="text-lg px-8 text-white btn-shine">
                <svg className="mr-2 h-5 w-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                </svg>
                Sign In with Microsoft
              </Button>
            ) : (
              <Button onClick={handleContinue} size="lg" className="text-lg px-8 text-white btn-shine">
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

        {/* Live Demo Animation */}
        <div className="mt-16 hidden lg:block">
          <WizardDemo />
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
            <Card className="group card-interactive">
              <CardHeader>
                <Shield className="h-10 w-10 mb-3 text-primary icon-hover" />
                <CardTitle>Safety First</CardTitle>
                <CardDescription>
                  All objects are marked for tracking. Delete operations verify markers and check for active assignments before removal.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="group card-interactive">
              <CardHeader>
                <Zap className="h-10 w-10 mb-3 text-primary icon-hover" />
                <CardTitle>Smart Deployment</CardTitle>
                <CardDescription>
                  Existing objects are automatically skipped. License requirements are checked and unsupported features are bypassed.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="group card-interactive">
              <CardHeader>
                <Cloud className="h-10 w-10 mb-3 text-primary icon-hover" />
                <CardTitle>Multi-Cloud Support</CardTitle>
                <CardDescription>
                  Works with Global, US Government (GCC High & DoD), Germany, and China (21Vianet) clouds.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="group card-interactive">
              <CardHeader>
                <GitBranch className="h-10 w-10 mb-3 text-primary icon-hover" />
                <CardTitle>Three Operation Modes</CardTitle>
                <CardDescription>
                  Create new configurations, preview changes without applying them, or delete previously created objects.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="group card-interactive">
              <CardHeader>
                <FileCheck className="h-10 w-10 mb-3 text-primary icon-hover" />
                <CardTitle>OpenIntuneBaseline</CardTitle>
                <CardDescription>
                  Integrates with OpenIntuneBaseline for 70+ security and configuration policies maintained by the community.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="group card-interactive">
              <CardHeader>
                <CheckCircle2 className="h-10 w-10 mb-3 text-primary icon-hover" />
                <CardTitle>Pre-flight Validation</CardTitle>
                <CardDescription>
                  Validates Intune license, Premium P2 for risk policies, and Windows E3/E5 for driver updates before deployment.
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
            <Card className="group card-interactive p-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserCircle className="h-8 w-8 text-primary icon-hover" />
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
            </Card>

            <Card className="group card-interactive p-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Settings className="h-8 w-8 text-primary icon-hover" />
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
            </Card>

            <Card className="group card-interactive p-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Play className="h-8 w-8 text-primary icon-hover" />
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
            </Card>

            <Card className="group card-interactive p-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Download className="h-8 w-8 text-primary icon-hover" />
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
            </Card>
          </div>
        </div>
      </section>

      {/* What Gets Deployed Section */}
      <section id="what-gets-deployed" className="container mx-auto px-4 py-16 scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Available Configurations
            </h2>
            <p className="text-lg text-muted-foreground">
              Pick and choose what you need. Deploy everything or just specific items.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3 md:grid-rows-2">
            {/* Configuration Profiles - Featured large card */}
            <Card className="group card-interactive md:row-span-2">
              <CardHeader className="h-full">
                <div className="flex flex-col h-full">
                  <div className="p-3 rounded-lg bg-primary/10 w-fit mb-4">
                    <FileCheck className="h-8 w-8 text-primary icon-hover" />
                  </div>
                  <CardTitle className="text-xl mb-4">Configuration Profiles</CardTitle>
                  <ul className="space-y-3 text-sm text-muted-foreground flex-1">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      <AnimatedCounter value={806} className="font-medium" /> Settings Catalog policies
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      <AnimatedCounter value={3} className="font-medium" /> Driver Update profiles
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      <AnimatedCounter value={3} className="font-medium" /> Update Rings (WUfB)
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      CIS and OpenIntuneBaseline Sourced
                    </li>
                  </ul>
                  <div className="mt-4 pt-4 border-t border-border/50">
                    <AnimatedCounter value={812} className="text-2xl font-bold text-primary" />
                    <span className="text-sm text-muted-foreground ml-2">total profiles</span>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Security Policies */}
            <Card className="group card-interactive">
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Shield className="h-6 w-6 text-primary icon-hover" />
                  </div>
                  <div>
                    <CardTitle className="mb-2">Security Policies</CardTitle>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <AnimatedCounter value={21} className="font-medium" /> Conditional Access
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <AnimatedCounter value={18} className="font-medium" /> Compliance policies
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <AnimatedCounter value={12} className="font-medium" /> App Protection
                      </li>
                    </ul>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Groups & Targeting */}
            <Card className="group card-interactive">
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="h-6 w-6 text-primary icon-hover" />
                  </div>
                  <div>
                    <CardTitle className="mb-2">Groups & Targeting</CardTitle>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <AnimatedCounter value={47} className="font-medium" /> Device groups
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <AnimatedCounter value={24} className="font-medium" /> Assignment filters
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <AnimatedCounter value={3} className="font-medium" /> Enrollment profiles
                      </li>
                    </ul>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Customization - Wide card */}
            <Card className="group card-interactive md:col-span-2">
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Filter className="h-6 w-6 text-primary icon-hover" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="mb-2">Customization Options</CardTitle>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Select specific categories
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Custom baseline repository
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Preview before deployment
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Detailed execution reports
                      </div>
                    </div>
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
              <AccordionTrigger>Is this tool free to use?</AccordionTrigger>
              <AccordionContent>
                Yes, the Intune Hydration Kit is completely free and open-source. There are no licensing fees,
                subscriptions, or hidden costs. You only need valid Microsoft licenses for the Intune features
                you want to deploy (e.g., Intune license, Entra ID P2 for risk-based policies, Windows E3/E5
                for driver updates).
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger>Is this tool safe to use in production?</AccordionTrigger>
              <AccordionContent>
                Yes. Safety features include: hydration markers on all created objects, assignment checks
                before deletion (objects with assignments are skipped), Conditional Access policies created
                disabled, and duplicate detection to prevent overwrites. We recommend testing in a dev/test
                tenant first.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3">
              <AccordionTrigger>What permissions do I need?</AccordionTrigger>
              <AccordionContent>
                You need to be a Global Administrator or Intune Administrator with the ability to consent
                to the required Microsoft Graph API permissions. The permissions include read/write access
                to device management configurations, groups, policies, and conditional access. Admin consent
                is required during sign-in.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4">
              <AccordionTrigger>What licenses are required?</AccordionTrigger>
              <AccordionContent>
                At minimum, you need an Intune license (Microsoft 365 E3/E5, Business Premium, or standalone).
                Risk-based Conditional Access policies require Premium P2. Driver Update profiles require
                Windows E3/E5. License checks run during pre-flight validation and unsupported policies are
                automatically skipped with a clear reason in the results.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5">
              <AccordionTrigger>Can I undo or rollback changes?</AccordionTrigger>
              <AccordionContent>
                Yes. Use the Delete operation mode to remove all objects created by this tool. The delete
                operation verifies hydration markers, checks for active assignments, and ensures Conditional
                Access policies are disabled before removal. Objects with assignments are skipped to prevent
                disruption.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-6">
              <AccordionTrigger>What is OpenIntuneBaseline?</AccordionTrigger>
              <AccordionContent>
                OpenIntuneBaseline is an open-source community project that provides 70+ security and
                configuration policies for Windows and macOS. These policies follow Microsoft&apos;s security
                recommendations and industry best practices. The Intune Hydration Kit can automatically
                download and deploy the latest baseline from GitHub.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-7">
              <AccordionTrigger>Does this work with government cloud environments?</AccordionTrigger>
              <AccordionContent>
                Yes. The tool supports multiple cloud environments including Global (Commercial),
                US Government (GCC High), US Government DoD, Germany, and China (21Vianet). Select
                your cloud environment during the tenant configuration step.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-8">
              <AccordionTrigger>How long does the hydration process take?</AccordionTrigger>
              <AccordionContent>
                A full deployment of all 900+ objects typically takes 10-30 minutes. The tool processes
                tasks sequentially to avoid API throttling and includes automatic retry logic for
                transient errors. You can monitor progress in real-time on the dashboard.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-9">
              <AccordionTrigger>What happens if an object already exists?</AccordionTrigger>
              <AccordionContent>
                In Create mode, objects are checked against a pre-fetched cache of existing tenant objects.
                If a match is found by display name (case-insensitive), the object is skipped. This makes
                deployments idempotent and safe to re-run without creating duplicates.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-10">
              <AccordionTrigger>Where can I inspect what is being imported?</AccordionTrigger>
              <AccordionContent>
                <p className="mb-3">
                  All configurations are based on open-source templates and Microsoft best practices.
                  You can review the source configurations at:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <a href="https://github.com/jorgeasaurus/OpenIntuneBaseline" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      OpenIntuneBaseline (Windows/macOS policies)
                    </a>
                  </li>
                  <li>
                    <a href="https://github.com/IntuneAdmin/IntuneBaselines" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      CIS Intune Baselines
                    </a>
                  </li>
                  <li>
                    <a href="https://learn.microsoft.com/en-us/intune/intune-service/apps/app-protection-framework" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Microsoft App Protection Framework
                    </a>
                  </li>
                  <li>
                    <a href="https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-policy-common" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Microsoft Common Conditional Access Policies
                    </a>
                  </li>
                </ul>
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
                  <Button onClick={handleSignInClick} size="lg" className="text-lg px-8 text-white btn-shine">
                    <svg className="mr-2 h-5 w-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                      <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                      <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                    </svg>
                    Get Started Now
                  </Button>
                ) : (
                  <Button onClick={handleContinue} size="lg" className="text-lg px-8 text-white btn-shine">
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
    </div>
  );
}
