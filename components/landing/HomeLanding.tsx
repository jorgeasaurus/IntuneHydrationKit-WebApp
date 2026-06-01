"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  GitBranch,
  Lock,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CloudEnvironmentSelector } from "@/components/CloudEnvironmentSelector";
import { Navigation } from "@/components/Navigation";
import { WebAppDemo } from "@/components/WebAppDemo";
import type { CloudEnvironment } from "@/types/hydration";
import {
  APP_VERSION,
  CONFIGURATION_GROUPS,
  FAQ_ITEMS,
  FEATURES,
  HERO_STATS,
  MOBILE_RUN_STEPS,
  PERMISSIONS,
  STEPS,
  type ConfigurationGroup,
} from "@/components/landing/landingContent";

type HomeLandingProps = {
  isAuthenticated: boolean;
  showCloudSelector: boolean;
  onSignInClick: () => void;
  onCloudSelect: (environment: CloudEnvironment) => void | Promise<void>;
  onCloudSelectorCancel: () => void;
  onContinue: () => void;
};

function MicrosoftLogo() {
  return (
    <svg
      className="size-5"
      viewBox="0 0 21 21"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function PrimaryAction({
  isAuthenticated,
  onSignInClick,
  onContinue,
  labelWhenSignedOut = "Sign In with Microsoft",
  labelWhenSignedIn = "Launch Wizard",
}: {
  isAuthenticated: boolean;
  onSignInClick: () => void;
  onContinue: () => void;
  labelWhenSignedOut?: string;
  labelWhenSignedIn?: string;
}) {
  if (isAuthenticated) {
    return (
      <Button
        onClick={onContinue}
        size="lg"
        className="btn-hydrate landing-primary-action col-span-2 h-12 w-full shrink-0 px-7 text-base sm:col-span-1 sm:w-auto"
      >
        <Terminal className="size-5" />
        {labelWhenSignedIn}
      </Button>
    );
  }

  return (
    <Button
      onClick={onSignInClick}
      size="lg"
      className="btn-hydrate landing-primary-action col-span-2 h-12 w-full shrink-0 px-7 text-base sm:col-span-1 sm:w-auto"
    >
      <MicrosoftLogo />
      {labelWhenSignedOut}
    </Button>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-7 flex items-center gap-4">
      <div className="h-px flex-1 bg-border" />
      <p className="font-mono text-xs uppercase text-muted-foreground">
        {children}
      </p>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function MobileRunPreview() {
  return (
    <div className="landing-mobile-preview rounded-lg border border-border/80 bg-card/80 p-4 shadow-sm backdrop-blur lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase text-muted-foreground">
            Live run preview
          </p>
          <p className="text-sm font-semibold">Scope, execute, report</p>
        </div>
        <span className="badge-status badge-info text-[10px]">
          <span className="status-dot status-dot-info" />
          Hydrate
        </span>
      </div>
      <div className="mt-4 grid gap-2">
        {MOBILE_RUN_STEPS.map((step) => (
          <div
            key={step.label}
            className="flex items-center justify-between rounded-md border border-border/70 bg-background/70 px-3 py-2"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="size-4 text-signal-success" />
              {step.label}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {step.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Hero({
  isAuthenticated,
  onSignInClick,
  onContinue,
}: Pick<HomeLandingProps, "isAuthenticated" | "onSignInClick" | "onContinue">) {
  return (
    <section className="relative overflow-hidden pt-20 pb-8 sm:pt-24 sm:pb-16">
      <div
        className="absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,hsl(var(--hydrate)/0.12),transparent)]"
        aria-hidden="true"
      />
      <div className="container relative mx-auto px-4 sm:px-6">
        <div className="grid items-center gap-6 sm:gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.05fr)]">
          <div className="space-y-5 sm:space-y-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="landing-version-badge inline-flex items-center gap-2 rounded-md border border-hydrate/35 bg-hydrate/10 px-3 py-1.5 font-mono text-xs uppercase text-hydrate">
                <span className="size-2 rounded-full bg-hydrate" />
                {APP_VERSION}
              </span>
              <span className="inline-flex items-center gap-2 rounded-md border border-border/80 bg-background/70 px-3 py-1.5 font-mono text-xs uppercase text-muted-foreground">
                <ShieldCheck className="size-3.5 text-signal-success" />
                Commercial tenant console
              </span>
            </div>

            <div className="max-w-3xl space-y-5">
              <h1 className="hero-title text-4xl sm:text-7xl lg:text-8xl">
                Intune Hydration Kit
              </h1>
              <p className="landing-lead max-w-2xl text-base leading-7 text-muted-foreground sm:text-xl sm:leading-8">
                A guided Microsoft Graph console for bootstrapping Intune
                tenants with policy templates, safety checks, preview mode, and
                deployable evidence.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:flex-wrap">
              <PrimaryAction
                isAuthenticated={isAuthenticated}
                onSignInClick={onSignInClick}
                onContinue={onContinue}
              />
              <Button
                variant="outline"
                size="lg"
                className="landing-secondary-action h-12 shrink-0 border-2 px-4 text-base font-semibold sm:px-7"
                asChild
              >
                <a
                  href="https://github.com/jorgeasaurus/IntuneHydrationKit"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <GitBranch className="size-5" />
                  PowerShell Module
                </a>
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="landing-tertiary-action h-12 shrink-0 px-4 text-base font-semibold sm:px-5"
                asChild
              >
                <Link href="/templates">
                  Template Docs
                  <ChevronRight className="size-5" />
                </Link>
              </Button>
            </div>

            <MobileRunPreview />

            <div className="landing-stat-rail hidden gap-2 rounded-lg border border-border/80 bg-card/70 p-2 backdrop-blur sm:grid sm:grid-cols-4">
              {HERO_STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="landing-stat-cell rounded-md border border-border/70 bg-background/55 p-3"
                >
                  <div className="font-mono text-2xl font-bold text-foreground">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-xs uppercase text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div
              className="absolute -inset-x-6 top-8 bottom-8 border-y border-hydrate/20"
              aria-hidden="true"
            />
            <div className="relative mx-auto max-w-2xl">
              <div className="landing-preview-bar mb-3 flex items-center justify-between rounded-lg border border-border/80 bg-background/75 px-4 py-3 backdrop-blur">
                <div>
                  <p className="font-mono text-xs uppercase text-muted-foreground">
                    Live run preview
                  </p>
                  <p className="text-sm font-semibold">
                    Scope, execute, report
                  </p>
                </div>
                <span className="badge-status badge-info text-[10px]">
                  <span className="status-dot status-dot-info" />
                  Hydrate
                </span>
              </div>
              <WebAppDemo />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-20 py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>Operating Model</SectionEyebrow>
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-4">
              <h2 className="text-3xl font-bold sm:text-4xl">
                Built for repeatable tenant work, not a one-off wizard.
              </h2>
              <p className="text-base leading-7 text-muted-foreground">
                v2.5 presents the app as an operator console: predictable,
                scannable, and explicit about the safeguards behind every
                deployment.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <Card key={feature.title} className="data-card overflow-hidden">
                  <CardHeader className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="rounded-md border border-hydrate/25 bg-hydrate/10 p-2.5">
                        <feature.icon className="size-5 text-hydrate" />
                      </div>
                      <span className="font-mono text-[10px] uppercase text-muted-foreground">
                        {feature.signal}
                      </span>
                    </div>
                    <div>
                      <CardTitle className="mb-2 text-lg">
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
      </div>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section className="border-y border-border/80 bg-muted/25 py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-3 font-mono text-xs uppercase text-hydrate">
                Guided execution
              </p>
              <h2 className="text-3xl font-bold sm:text-4xl">
                Four checkpoints from consent to evidence.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              Each stage exists to make the next one safer: connect the tenant,
              scope the work, execute intentionally, then export results.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((item) => (
              <div key={item.step} className="relative">
                <Card className="data-card h-full overflow-hidden">
                  <CardHeader className="space-y-5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-3xl font-bold text-hydrate/35">
                        {item.step}
                      </span>
                      <div className="rounded-md border border-border bg-background p-2">
                        <item.icon className="size-5" />
                      </div>
                    </div>
                    <div>
                      <CardTitle className="mb-2 text-lg">
                        {item.title}
                      </CardTitle>
                      <CardDescription className="text-sm leading-relaxed">
                        {item.description}
                      </CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ConfigurationCard({ group }: { group: ConfigurationGroup }) {
  return (
    <Card
      className={`data-card overflow-hidden ${
        group.featured ? "md:row-span-2" : ""
      }`}
    >
      <CardHeader className="flex h-full flex-col">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="rounded-md border border-hydrate/25 bg-hydrate/10 p-3">
            <group.icon className="size-6 text-hydrate" />
          </div>
          <span className="font-mono text-xs uppercase text-muted-foreground">
            {group.label}
          </span>
        </div>
        <CardTitle className="mb-3 text-xl">{group.title}</CardTitle>
        <div className="mb-6 flex items-baseline gap-2 border-b border-border pb-5">
          <span className="stat-display text-4xl">
            <AnimatedCounter value={group.total} />
          </span>
          <span className="text-sm text-muted-foreground">{group.unit}</span>
        </div>
        <ul className="space-y-3 text-sm text-muted-foreground">
          {group.items.map((item) => (
            <li key={`${group.title}-${item.label}`} className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-signal-success" />
              <span>
                <span className="font-mono font-semibold text-foreground">
                  {typeof item.value === "number" ? (
                    <AnimatedCounter value={item.value} />
                  ) : (
                    item.value
                  )}
                </span>{" "}
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </CardHeader>
    </Card>
  );
}

function ConfigurationsSection() {
  return (
    <section id="what-gets-deployed" className="scroll-mt-20 py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>Available Configurations</SectionEyebrow>
          <div className="mb-8 grid gap-4 md:grid-cols-[0.75fr_1.25fr]">
            <h2 className="text-3xl font-bold sm:text-4xl">
              A large template library with precise operator controls.
            </h2>
            <p className="text-base leading-7 text-muted-foreground">
              The app groups the template catalog by what admins actually need
              to reason about: profiles, policy controls, targeting, and run
              customization.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3 md:grid-rows-2">
            {CONFIGURATION_GROUPS.map((group) => (
              <ConfigurationCard key={group.title} group={group} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PermissionsSection() {
  return (
    <section className="py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <Card className="data-card overflow-hidden border-hydrate/30">
            <div className="h-1 bg-gradient-to-r from-hydrate via-primary to-hydrate" />
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="rounded-md border border-hydrate/25 bg-hydrate/10 p-3">
                  <Lock className="size-6 text-hydrate" />
                </div>
                <div className="flex-1">
                  <CardTitle className="mb-2 text-xl">
                    Required Microsoft Graph Permissions
                  </CardTitle>
                  <CardDescription className="text-base">
                    Delegated scopes required for read/write access to Intune
                    and Conditional Access objects.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PERMISSIONS.map((permission) => (
                  <code
                    key={permission}
                    className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs"
                  >
                    {permission}
                  </code>
                ))}
              </div>
              <div className="mt-4 rounded-md border border-signal-warning/30 bg-signal-warning/10 p-3">
                <p className="text-sm">
                  <strong className="text-signal-warning">Note:</strong>{" "}
                  <span className="text-muted-foreground">
                    Admin consent is required. Accept these scopes during
                    sign-in.
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-20 border-y border-border/80 bg-muted/25 py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <p className="mb-3 font-mono text-xs uppercase text-hydrate">
              Field Notes
            </p>
            <h2 className="mb-3 text-3xl font-bold sm:text-4xl">
              Frequently Asked Questions
            </h2>
            <p className="text-base text-muted-foreground">
              Common questions before a tenant hydration run.
            </p>
          </div>
          <Accordion type="single" collapsible className="w-full space-y-2">
            {FAQ_ITEMS.map((item) => (
              <AccordionItem
                key={item.question}
                value={item.question}
                className="data-card border px-6"
              >
                <AccordionTrigger className="py-4 text-left font-semibold hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="pb-4 text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

function FinalCta({
  isAuthenticated,
  onSignInClick,
  onContinue,
}: Pick<HomeLandingProps, "isAuthenticated" | "onSignInClick" | "onContinue">) {
  return (
    <section className="py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="h-1 bg-gradient-to-r from-hydrate via-primary to-hydrate" />
            <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="mb-3 font-mono text-xs uppercase text-hydrate">
                  Ready state
                </p>
                <h2 className="mb-3 text-3xl font-bold sm:text-4xl">
                  Start a guided tenant run.
                </h2>
                <p className="max-w-2xl text-muted-foreground">
                  Sign in, confirm prerequisites, choose scope, and review the
                  run before any tenant mutation.
                </p>
              </div>
              <PrimaryAction
                isAuthenticated={isAuthenticated}
                onSignInClick={onSignInClick}
                onContinue={onContinue}
                labelWhenSignedOut="Get Started"
                labelWhenSignedIn="Continue"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t py-8">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground" suppressHydrationWarning>
              {new Date().getFullYear()} IntuneHydrationKit
            </span>
            <span className="badge-status badge-info text-[10px]">
              MIT License
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm">
            <a
              href="https://github.com/jorgeasaurus/IntuneHydrationKit"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-hydrate"
            >
              PowerShell Module
            </a>
            <a
              href="https://learn.microsoft.com/en-us/graph/api/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-hydrate"
            >
              Microsoft Graph
            </a>
            <a
              href="https://github.com/jorgeasaurus/IntuneHydrationKit-WebApp/issues/new/choose"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-hydrate"
            >
              Submit an Issue
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function HomeLanding({
  isAuthenticated,
  showCloudSelector,
  onSignInClick,
  onCloudSelect,
  onCloudSelectorCancel,
  onContinue,
}: HomeLandingProps) {
  return (
    <div className="landing-shell relative min-h-screen">
      <div className="relative z-10">
        <Navigation />
        <Hero
          isAuthenticated={isAuthenticated}
          onSignInClick={onSignInClick}
          onContinue={onContinue}
        />
        <FeaturesSection />
        <WorkflowSection />
        <ConfigurationsSection />
        <PermissionsSection />
        <FaqSection />
        <FinalCta
          isAuthenticated={isAuthenticated}
          onSignInClick={onSignInClick}
          onContinue={onContinue}
        />
        <Footer />
      </div>

      <CloudEnvironmentSelector
        open={showCloudSelector}
        onSelect={onCloudSelect}
        onCancel={onCloudSelectorCancel}
      />
    </div>
  );
}
