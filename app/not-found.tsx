import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="relative min-h-screen">
      <div className="relative z-10">
        <Navigation />
        <main className="container mx-auto flex min-h-screen items-center justify-center px-4 pt-24 pb-16 sm:px-6">
          <section
            aria-labelledby="not-found-title"
            className="glass-panel w-full max-w-xl rounded-lg border border-border/80 p-8 text-center sm:p-10"
          >
            <p className="font-mono text-xs uppercase text-muted-foreground">
              Error 404
            </p>
            <h1 id="not-found-title" className="mt-4 text-3xl font-bold sm:text-4xl">
              Page not found
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              This page does not exist or has moved. Go back to the home page,
              or browse the template catalog.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="btn-hydrate h-12 px-6">
                <Link href="/">
                  <ArrowLeft className="size-5" aria-hidden="true" />
                  Back to home
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 border-2 px-6">
                <Link href="/templates">
                  <BookOpen className="size-5" aria-hidden="true" />
                  Browse templates
                </Link>
              </Button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
