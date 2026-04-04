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
  Terminal,
  Cpu,
  Database,
  Lock,
  Activity,
  Box,
  Layers,
  ChevronRight,
} from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { CloudEnvironmentSelector } from "@/components/CloudEnvironmentSelector";
import { WebAppDemo } from "@/components/WebAppDemo";
import { CloudEnvironment } from "@/types/hydration";
import { useWizardState } from "@/hooks/useWizardState";

function MicrosoftLogo() {
  return (
    <svg
      className="mr-2 h-5 w-5"
      viewBox="0 0 21 21"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

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
      <div className="relative z-10">
        <Navigation />

        {/* Hero Section */}
        <section className="pt-24 pb-20">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center min-h-[calc(100vh-200px)]">
              {/* Left: Hero Content */}
              <div className="space-y-8">
                {/* Status Badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-hydrate/10 border border-hydrate/30">
                  <span className="w-2 h-2 rounded-full bg-hydrate animate-pulse" />
                  <span className="text-xs font-mono text-hydrate uppercase tracking-wider">
                    v2.1
                  </span>
                </div>

                {/* Main Headline */}
                <div className="space-y-4">
                  <h1 className="hero-title text-6xl sm:text-7xl lg:text-8xl">
                    Bootstrap Your
                    <br />
                    <span className="hero-highlight">Intune Tenant</span>
                  </h1>
                  <p className="text-xl text-muted-foreground max-w-lg leading-relaxed">
                    Deploy{" "}
                    <span className="font-mono text-foreground font-semibold">900+</span>{" "}
                    Microsoft Intune policies, groups, filters, and configurations.
                    Enterprise-grade. Zero hassle.
                  </p>
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  {!isAuthenticated ? (
                    <Button
                      onClick={handleSignInClick}
                      variant="outline"
                      size="lg"
                      className="h-12 px-8 text-base font-semibold border-2"
                    >
                      <MicrosoftLogo />
                      Sign In with Microsoft
                    </Button>
                  ) : (
                    <Button
                      onClick={handleContinue}
                      variant="outline"
                      size="lg"
                      className="h-12 px-8 text-base font-semibold border-2"
                    >
                      <Terminal className="mr-2 h-5 w-5" />
                      Launch Wizard
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-12 px-8 text-base font-semibold border-2"
                    asChild
                  >
                    <a
                      href="https://github.com/jorgeasaurus/IntuneHydrationKit"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <GitBranch className="mr-2 h-5 w-5" />
                      PowerShell Module
                    </a>
                  </Button>
                </div>

                <CloudEnvironmentSelector
                  open={showCloudSelector}
                  onSelect={handleCloudSelect}
                  onCancel={handleCloudSelectorCancel}
                />
              </div>

              {/* Right: Web App Demo */}
              <div className="hidden lg:block">
                <WebAppDemo />
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 scroll-mt-20">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-6xl mx-auto">
              {/* Section Header */}
              <div className="flex items-center gap-4 mb-12">
                <div className="h-px flex-1 bg-border" />
                <h2 className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
                  Core Features
                </h2>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Feature Grid */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    icon: Shield,
                    title: "Safety First",
                    description:
                      "All objects are marked for tracking. Delete operations verify markers and check assignments before removal.",
                    status: "ACTIVE",
                  },
                  {
                    icon: Zap,
                    title: "Smart Deployment",
                    description:
                      "Existing objects are automatically skipped. License requirements are checked and unsupported features bypassed.",
                    status: "ACTIVE",
                  },
                  {
                    icon: Cloud,
                    title: "Multi-Cloud Support",
                    description:
                      "Works with Global, US Government (GCC High & DoD), Germany, and China (21Vianet) clouds.",
                    status: "ACTIVE",
                  },
                  {
                    icon: GitBranch,
                    title: "Three Operation Modes",
                    description:
                      "Create new configurations, preview changes without applying, or delete previously created objects.",
                    status: "ACTIVE",
                  },
                  {
                    icon: FileCheck,
                    title: "OpenIntuneBaseline",
                    description:
                      "Integrates with OpenIntuneBaseline for 70+ security policies maintained by the community.",
                    status: "ACTIVE",
                  },
                  {
                    icon: Activity,
                    title: "Pre-flight Validation",
                    description:
                      "Validates Intune license, Premium P2 for risk policies, and Windows E3/E5 for driver updates.",
                    status: "ACTIVE",
                  },
                ].map((feature, index) => (
                  <Card
                    key={index}
                    className="data-card group overflow-hidden"
                  >
                    <CardHeader className="space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="p-2.5 rounded-md bg-hydrate/10 border border-hydrate/20">
                          <feature.icon className="h-5 w-5 text-hydrate" />
                        </div>
                        <span className="badge-status badge-success text-[10px]">
                          <span className="status-dot status-dot-success" />
                          {feature.status}
                        </span>
                      </div>
                      <div>
                        <CardTitle className="text-lg mb-2">
                          {feature.title}
                        </CardTitle>
                        <CardDescription className="text-sm leading-relaxed">
                          {feature.description}
                        </CardDescription>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-24 bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-6xl mx-auto">
              {/* Section Header */}
              <div className="text-center mb-16">
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                  How It Works
                </h2>
                <p className="text-lg text-muted-foreground">
                  Four steps to a fully configured Intune tenant
                </p>
              </div>

              {/* Steps */}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    step: "01",
                    icon: Lock,
                    title: "Authenticate",
                    description: "Sign in with your Microsoft account and connect to your Intune tenant",
                  },
                  {
                    step: "02",
                    icon: Cpu,
                    title: "Configure",
                    description: "Select policies, groups, filters, or conditional access to deploy",
                  },
                  {
                    step: "03",
                    icon: Terminal,
                    title: "Deploy",
                    description: "Review selections and deploy configurations with one click",
                  },
                  {
                    step: "04",
                    icon: Database,
                    title: "Export",
                    description: "Download detailed reports and review deployed configurations",
                  },
                ].map((item, index) => (
                  <div key={index} className="relative">
                    <Card className="data-card h-full">
                      <CardHeader className="space-y-4">
                        {/* Step Number */}
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-4xl font-bold text-hydrate/20">
                            {item.step}
                          </span>
                          <div className="p-2 rounded-md bg-muted">
                            <item.icon className="h-5 w-5 text-foreground" />
                          </div>
                        </div>
                        <div>
                          <CardTitle className="text-lg mb-2">
                            {item.title}
                          </CardTitle>
                          <CardDescription className="text-sm">
                            {item.description}
                          </CardDescription>
                        </div>
                      </CardHeader>
                    </Card>
                    {/* Connector Arrow */}
                    {index < 3 && (
                      <div className="hidden lg:flex absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                        <ChevronRight className="h-6 w-6 text-border" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* What Gets Deployed Section */}
        <section id="what-gets-deployed" className="py-24 scroll-mt-20">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-6xl mx-auto">
              {/* Section Header */}
              <div className="flex items-center gap-4 mb-12">
                <div className="h-px flex-1 bg-border" />
                <h2 className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
                  Available Configurations
                </h2>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Bento Grid */}
              <div className="grid gap-4 md:grid-cols-3 md:grid-rows-2">
                {/* Configuration Profiles - Large Card */}
                <Card className="data-card md:row-span-2 overflow-hidden">
                  <CardHeader className="h-full flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-3 rounded-md bg-hydrate/10 border border-hydrate/20">
                        <Layers className="h-6 w-6 text-hydrate" />
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        PRIMARY
                      </span>
                    </div>
                    <CardTitle className="text-xl mb-4">
                      Configuration Profiles
                    </CardTitle>
                    <ul className="space-y-3 text-sm text-muted-foreground flex-1">
                      <li className="flex items-center gap-3">
                        <CheckCircle2 className="h-4 w-4 text-signal-success shrink-0" />
                        <span>
                          <span className="font-mono font-semibold text-foreground">
                            <AnimatedCounter value={798} />
                          </span>{" "}
                          Settings Catalog policies
                        </span>
                      </li>
                      <li className="flex items-center gap-3">
                        <CheckCircle2 className="h-4 w-4 text-signal-success shrink-0" />
                        <span>
                          <span className="font-mono font-semibold text-foreground">
                            <AnimatedCounter value={3} />
                          </span>{" "}
                          Driver Update profiles
                        </span>
                      </li>
                      <li className="flex items-center gap-3">
                        <CheckCircle2 className="h-4 w-4 text-signal-success shrink-0" />
                        <span>
                          <span className="font-mono font-semibold text-foreground">
                            <AnimatedCounter value={3} />
                          </span>{" "}
                          Update Rings (WUfB)
                        </span>
                      </li>
                      <li className="flex items-center gap-3">
                        <CheckCircle2 className="h-4 w-4 text-signal-success shrink-0" />
                        <span>CIS and OpenIntuneBaseline Sourced</span>
                      </li>
                    </ul>
                    <div className="mt-6 pt-4 border-t border-border">
                      <div className="flex items-baseline gap-2">
                        <span className="stat-display text-4xl">
                          <AnimatedCounter value={805} />
                        </span>
                        <span className="text-sm text-muted-foreground">
                          total profiles
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                {/* Security Policies */}
                <Card className="data-card overflow-hidden">
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-md bg-muted">
                        <Shield className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-base mb-3">
                          Security Policies
                        </CardTitle>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-signal-success" />
                            <span className="font-mono text-foreground">
                              <AnimatedCounter value={21} />
                            </span>{" "}
                            Conditional Access
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-signal-success" />
                            <span className="font-mono text-foreground">
                              <AnimatedCounter value={16} />
                            </span>{" "}
                            Compliance policies
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-signal-success" />
                            <span className="font-mono text-foreground">
                              <AnimatedCounter value={10} />
                            </span>{" "}
                            App Protection
                          </li>
                        </ul>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                {/* Groups & Targeting */}
                <Card className="data-card overflow-hidden">
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-md bg-muted">
                        <Users className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-base mb-3">
                          Groups & Targeting
                        </CardTitle>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-signal-success" />
                            <span className="font-mono text-foreground">
                              <AnimatedCounter value={47} />
                            </span>{" "}
                            Device groups
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-signal-success" />
                            <span className="font-mono text-foreground">
                              <AnimatedCounter value={24} />
                            </span>{" "}
                            Assignment filters
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-signal-success" />
                            <span className="font-mono text-foreground">
                              <AnimatedCounter value={3} />
                            </span>{" "}
                            Enrollment profiles
                          </li>
                        </ul>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                {/* Customization Options - Wide Card */}
                <Card className="data-card md:col-span-2 overflow-hidden">
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-md bg-muted">
                        <Box className="h-5 w-5 text-foreground" />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-base mb-3">
                          Customization Options
                        </CardTitle>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-signal-success" />
                            Select specific categories
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-signal-success" />
                            Custom baseline repository
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-signal-success" />
                            Preview before deployment
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-signal-success" />
                            Detailed execution reports
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Required Permissions Section */}
        <section className="py-24">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">
              <Card className="data-card border-hydrate/30 overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-hydrate via-primary to-hydrate" />
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-md bg-hydrate/10 border border-hydrate/20">
                      <Lock className="h-6 w-6 text-hydrate" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">
                        Required Microsoft Graph Permissions
                      </CardTitle>
                      <CardDescription className="text-base">
                        These delegated scopes are required for read/write access to Intune objects.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      "DeviceManagementConfiguration.ReadWrite.All",
                      "DeviceManagementServiceConfig.ReadWrite.All",
                      "DeviceManagementManagedDevices.ReadWrite.All",
                      "DeviceManagementScripts.ReadWrite.All",
                      "DeviceManagementApps.ReadWrite.All",
                      "Group.ReadWrite.All",
                      "Policy.Read.All",
                      "Policy.ReadWrite.ConditionalAccess",
                      "Application.Read.All",
                      "Directory.ReadWrite.All",
                      "LicenseAssignment.Read.All",
                      "Organization.Read.All",
                    ].map((permission) => (
                      <code
                        key={permission}
                        className="px-3 py-2 rounded-md bg-muted text-xs font-mono border border-border"
                      >
                        {permission}
                      </code>
                    ))}
                  </div>
                  <div className="mt-4 p-3 rounded-md bg-signal-warning/10 border border-signal-warning/30">
                    <p className="text-sm">
                      <strong className="text-signal-warning">Note:</strong>{" "}
                      <span className="text-muted-foreground">
                        Admin consent is required for these permissions. Accept during sign-in.
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-24 bg-muted/30 scroll-mt-20">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">
              {/* Section Header */}
              <div className="text-center mb-12">
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                  Frequently Asked Questions
                </h2>
                <p className="text-lg text-muted-foreground">
                  Common questions about the Intune Hydration Kit
                </p>
              </div>

              <Accordion type="single" collapsible className="w-full space-y-2">
                {[
                  {
                    q: "Is this tool free to use?",
                    a: "Yes, the Intune Hydration Kit is completely free and open-source. There are no licensing fees, subscriptions, or hidden costs. You only need valid Microsoft licenses for the Intune features you want to deploy.",
                  },
                  {
                    q: "Is this tool safe to use in production?",
                    a: "Yes. Safety features include: hydration markers on all created objects, assignment checks before deletion (objects with assignments are skipped), Conditional Access policies created disabled, and duplicate detection to prevent overwrites. We recommend testing in a dev/test tenant first.",
                  },
                  {
                    q: "What permissions do I need?",
                    a: "You need to be a Global Administrator or Intune Administrator with the ability to consent to the required Microsoft Graph API permissions. Admin consent is required during sign-in.",
                  },
                  {
                    q: "What licenses are required?",
                    a: "At minimum, you need an Intune license (Microsoft 365 E3/E5, Business Premium, or standalone). Risk-based Conditional Access policies require Premium P2. Driver Update profiles require Windows E3/E5.",
                  },
                  {
                    q: "Can I undo or rollback changes?",
                    a: "Yes. Use the Delete operation mode to remove all objects created by this tool. The delete operation verifies hydration markers, checks for active assignments, and ensures Conditional Access policies are disabled before removal.",
                  },
                  {
                    q: "What is OpenIntuneBaseline?",
                    a: "OpenIntuneBaseline is an open-source community project that provides 70+ security and configuration policies for Windows and macOS. These policies follow Microsoft's security recommendations and industry best practices.",
                  },
                  {
                    q: "Does this work with government cloud environments?",
                    a: "Yes. The tool supports multiple cloud environments including Global (Commercial), US Government (GCC High), US Government DoD, Germany, and China (21Vianet).",
                  },
                  {
                    q: "What happens if an object already exists?",
                    a: "In Create mode, objects are checked against a pre-fetched cache of existing tenant objects. If a match is found by display name (case-insensitive), the object is skipped. This makes deployments idempotent and safe to re-run.",
                  },
                ].map((item, index) => (
                  <AccordionItem
                    key={index}
                    value={`item-${index}`}
                    className="data-card px-6 border"
                  >
                    <AccordionTrigger className="text-left font-semibold hover:no-underline py-4">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-4">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">
              <Card className="data-card overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-hydrate via-primary to-hydrate" />
                <CardHeader className="text-center space-y-6 py-12">
                  <div className="space-y-4">
                    <h2 className="text-3xl sm:text-4xl font-bold">
                      Ready to Bootstrap Your Tenant?
                    </h2>
                    <p className="text-lg text-muted-foreground">
                      Sign in with your Microsoft account and start the guided wizard
                    </p>
                  </div>
                  <div className="pt-4">
                    {!isAuthenticated ? (
                      <Button
                        onClick={handleSignInClick}
                        variant="outline"
                        size="lg"
                        className="h-12 px-8 text-base font-semibold border-2"
                      >
                        <MicrosoftLogo />
                        Get Started Now
                      </Button>
                    ) : (
                      <Button
                        onClick={handleContinue}
                        variant="outline"
                        size="lg"
                        className="h-12 px-8 text-base font-semibold border-2"
                      >
                        <Terminal className="mr-2 h-5 w-5" />
                        Continue to Wizard
                      </Button>
                    )}
                  </div>
                </CardHeader>
              </Card>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t py-8">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {new Date().getFullYear()} IntuneHydrationKit
                </span>
                <span className="badge-status badge-info text-[10px]">
                  MIT License
                </span>
              </div>
              <div className="flex gap-6 text-sm">
                <a
                  href="https://github.com/jorgeasaurus/IntuneHydrationKit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-hydrate transition-colors"
                >
                  PowerShell Module
                </a>
                <a
                  href="https://github.com/skiptotheendpoint/OpenIntuneBaseline"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-hydrate transition-colors"
                >
                  OpenIntuneBaseline
                </a>
                <a
                  href="https://learn.microsoft.com/en-us/graph/api/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-hydrate transition-colors"
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
