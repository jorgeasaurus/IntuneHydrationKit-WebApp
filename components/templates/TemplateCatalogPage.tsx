"use client";

import { Fragment, ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Navigation } from "@/components/Navigation";
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
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  loadTemplateDocumentationCatalog,
  loadTemplateDocumentationPayload,
  getPlatformFilterOrder,
  TemplateDocumentationCatalog,
  TemplateDocumentationItem,
} from "@/lib/templates/catalog";
import { TaskCategory } from "@/types/hydration";
import {
  ArrowRight,
  Boxes,
  Copy,
  FileCode2,
  Filter,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";

type PayloadState = {
  status: "loading" | "ready" | "error";
  data?: unknown;
  error?: string;
};

const CATEGORY_ORDER: TaskCategory[] = [
  "groups",
  "filters",
  "compliance",
  "appProtection",
  "conditionalAccess",
  "enrollment",
  "notification",
  "baseline",
  "cisBaseline",
];

const CATEGORY_ACCENTS: Record<TaskCategory, string> = {
  groups: "from-cyan-500/20 via-cyan-500/5 to-transparent",
  filters: "from-violet-500/20 via-violet-500/5 to-transparent",
  compliance: "from-emerald-500/20 via-emerald-500/5 to-transparent",
  appProtection: "from-fuchsia-500/20 via-fuchsia-500/5 to-transparent",
  conditionalAccess: "from-amber-500/20 via-amber-500/5 to-transparent",
  enrollment: "from-sky-500/20 via-sky-500/5 to-transparent",
  notification: "from-orange-500/20 via-orange-500/5 to-transparent",
  baseline: "from-indigo-500/20 via-indigo-500/5 to-transparent",
  cisBaseline: "from-rose-500/20 via-rose-500/5 to-transparent",
};

const INITIAL_VISIBLE_ITEMS = 60;
const VISIBLE_ITEMS_INCREMENT = 120;
const JSON_TOKEN_PATTERN =
  /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?::)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g;

function formatSummaryLabel(key: string): string {
  return key
    .replace(/^@/, "")
    .replace(/^_+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatSummaryValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }

  if (value && typeof value === "object") {
    return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? "" : "s"}`;
  }

  return "Available";
}

function buildHighlights(payload: unknown): Array<{ label: string; value: string }> {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const preferredKeys = [
    "@odata.type",
    "state",
    "membershipRule",
    "rule",
    "mailNickname",
    "osMinimumVersion",
    "technologies",
    "platforms",
    "priority",
  ];

  const ignoredKeys = new Set([
    "displayName",
    "name",
    "description",
    "_oibPlatform",
    "_oibPolicyType",
    "_oibFilePath",
    "_cisCategory",
    "_cisSubcategory",
    "_cisFilePath",
  ]);

  const highlights: Array<{ label: string; value: string }> = [];

  preferredKeys.forEach((key) => {
    const value = record[key];
    if (value === undefined || ignoredKeys.has(key)) {
      return;
    }

    highlights.push({
      label: formatSummaryLabel(key),
      value: formatSummaryValue(value),
    });
  });

  Object.entries(record).some(([key, value]) => {
    if (
      highlights.length >= 8 ||
      ignoredKeys.has(key) ||
      preferredKeys.includes(key) ||
      value === undefined ||
      value === null
    ) {
      return false;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      Array.isArray(value)
    ) {
      highlights.push({
        label: formatSummaryLabel(key),
        value: formatSummaryValue(value),
      });
    }

    return false;
  });

  return highlights.slice(0, 8);
}

function matchesSearch(item: TemplateDocumentationItem, query: string): boolean {
  const haystack = [
    item.displayName,
    item.description,
    item.subcategory,
    item.platform,
    item.itemType,
    item.sourcePath,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function getJsonTokenClassName(token: string): string {
  if (token.startsWith('"') && token.endsWith('":')) {
    return "text-cyan-300";
  }

  if (token.startsWith('"')) {
    return "text-emerald-300";
  }

  if (token === "true" || token === "false") {
    return "text-violet-300";
  }

  if (token === "null") {
    return "text-amber-300";
  }

  return "text-pink-300";
}

function renderHighlightedJson(payload: unknown): ReactNode {
  const formattedJson = JSON.stringify(payload, null, 2);
  const lines = formattedJson.split("\n");

  return lines.map((line, lineIndex) => {
    const tokens: ReactNode[] = [];
    let lastIndex = 0;

    for (const match of line.matchAll(JSON_TOKEN_PATTERN)) {
      const matchedToken = match[0];
      const startIndex = match.index ?? 0;

      if (startIndex > lastIndex) {
        tokens.push(
          <Fragment key={`plain-${lineIndex}-${lastIndex}`}>
            {line.slice(lastIndex, startIndex)}
          </Fragment>
        );
      }

      tokens.push(
        <span
          key={`token-${lineIndex}-${startIndex}`}
          className={getJsonTokenClassName(matchedToken)}
        >
          {matchedToken}
        </span>
      );

      lastIndex = startIndex + matchedToken.length;
    }

    if (lastIndex < line.length) {
      tokens.push(
        <Fragment key={`tail-${lineIndex}-${lastIndex}`}>
          {line.slice(lastIndex)}
        </Fragment>
      );
    }

    return (
      <Fragment key={`line-${lineIndex}`}>
        {tokens}
        {lineIndex < lines.length - 1 ? "\n" : null}
      </Fragment>
    );
  });
}

export function TemplateCatalogPage() {
  const [catalog, setCatalog] = useState<TemplateDocumentationCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | TaskCategory>("all");
  const [activePlatform, setActivePlatform] = useState<"all" | string>("all");
  const [openCategories, setOpenCategories] = useState<Set<TaskCategory>>(
    new Set(["groups"])
  );
  const [payloadStates, setPayloadStates] = useState<Record<string, PayloadState>>({});
  const [visibleItems, setVisibleItems] = useState<Record<string, number>>({});

  useEffect(() => {
    let isMounted = true;

    const loadCatalog = async () => {
      try {
        const result = await loadTemplateDocumentationCatalog();
        if (!isMounted) {
          return;
        }

        setCatalog(result);
        setVisibleItems(
          Object.fromEntries(
            CATEGORY_ORDER.map((category) => [category, INITIAL_VISIBLE_ITEMS])
          )
        );
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load the template catalog."
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadCatalog();

    return () => {
      isMounted = false;
    };
  }, []);

  const platforms = useMemo(() => {
    if (!catalog) {
      return [];
    }

    return getPlatformFilterOrder(
      Array.from(
        new Set(
          catalog.items
            .map((item) => item.platform)
            .filter((platform): platform is string => Boolean(platform))
        )
      )
    );
  }, [catalog]);

  const filteredItems = useMemo(() => {
    if (!catalog) {
      return [];
    }

    return catalog.items.filter((item) => {
      const categoryMatch =
        activeCategory === "all" || item.category === activeCategory;
      const platformMatch =
        activePlatform === "all" || item.platform === activePlatform;
      const searchMatch =
        searchQuery.trim().length === 0 || matchesSearch(item, searchQuery);

      return categoryMatch && platformMatch && searchMatch;
    });
  }, [activeCategory, activePlatform, catalog, searchQuery]);

  const groupedItems = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: filteredItems.filter((item) => item.category === category),
    })).filter((group) => group.items.length > 0);
  }, [filteredItems]);

  const activeCategorySummary = useMemo(() => {
    if (!catalog || activeCategory === "all") {
      return null;
    }

    return catalog.categories.find((category) => category.id === activeCategory) ?? null;
  }, [activeCategory, catalog]);

  const ensurePayload = async (item: TemplateDocumentationItem) => {
    const current = payloadStates[item.id];
    if (current?.status === "loading" || current?.status === "ready") {
      return;
    }

    setPayloadStates((previous) => ({
      ...previous,
      [item.id]: { status: "loading" },
    }));

    try {
      const payload = await loadTemplateDocumentationPayload(item);
      setPayloadStates((previous) => ({
        ...previous,
        [item.id]: { status: "ready", data: payload },
      }));
    } catch (payloadError) {
      setPayloadStates((previous) => ({
        ...previous,
        [item.id]: {
          status: "error",
          error:
            payloadError instanceof Error
              ? payloadError.message
              : "Failed to load template payload.",
        },
      }));
    }
  };

  const copyPayload = async (itemId: string) => {
    const payload = payloadStates[itemId]?.data;
    if (!payload) {
      return;
    }

    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast.success("Template JSON copied to clipboard.");
  };

  const toggleCategory = (category: TaskCategory) => {
    setOpenCategories((previous) => {
      const next = new Set(previous);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const showMoreItems = (category: TaskCategory) => {
    setVisibleItems((previous) => ({
      ...previous,
      [category]: (previous[category] ?? INITIAL_VISIBLE_ITEMS) + VISIBLE_ITEMS_INCREMENT,
    }));
  };

  return (
    <div className="min-h-screen relative">
      <div className="relative z-10">
        <Navigation />

        <main className="pt-24 pb-20">
          <section className="container mx-auto px-4 sm:px-6">
            <div className="mx-auto max-w-7xl space-y-10">
              <div className="overflow-hidden rounded-[32px] border border-border/70 bg-background/80 shadow-2xl shadow-black/20 backdrop-blur-xl">
                <div className="relative border-b border-border/70 px-6 py-8 sm:px-10">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]" />
                  <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl space-y-5">
                      <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-mono uppercase tracking-[0.32em] text-cyan-300">
                        <Boxes className="h-3.5 w-3.5" />
                        Template Atlas
                      </div>
                      <div className="space-y-3">
                        <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                          Inspect every payload before you import it.
                        </h1>
                        <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                          This catalog shows the actual transformed templates the web app imports,
                          including the <span className="font-mono text-foreground">[IHD]</span> prefix
                          and hydration marker. Browse by category, search by keyword, and open raw JSON
                          only when you need the full object.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:min-w-[360px]">
                      <div className="rounded-2xl border border-border/70 bg-black/20 p-4">
                        <div className="text-xs font-mono uppercase tracking-[0.28em] text-muted-foreground">
                          Importable items
                        </div>
                        <div className="mt-3 text-4xl font-black text-foreground">
                          {catalog ? catalog.totalCount.toLocaleString() : "--"}
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          Indexed from the same sources used by the wizard and execution engine.
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-black/20 p-4">
                        <div className="text-xs font-mono uppercase tracking-[0.28em] text-muted-foreground">
                          Raw JSON
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-lg font-semibold text-foreground">
                          <Sparkles className="h-4 w-4 text-cyan-300" />
                          On-demand loading
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          Large baseline catalogs stay fast because heavy payloads are fetched only after expansion.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 px-6 py-6 sm:px-10 lg:grid-cols-[320px,minmax(0,1fr)]">
                  <div className="space-y-6">
                    <Card className="border-border/70 bg-background/70 shadow-xl shadow-black/10">
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Search className="h-4 w-4 text-cyan-300" />
                          Filter the catalog
                        </CardTitle>
                        <CardDescription>
                          Find exact objects by name, platform, source path, or policy type.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div className="space-y-2">
                          <label className="text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
                            Search
                          </label>
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              value={searchQuery}
                              onChange={(event) => setSearchQuery(event.target.value)}
                              placeholder="Windows 11, Autopilot, Edge..."
                              className="pl-9"
                              aria-label="Search template catalog"
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
                            Category
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant={activeCategory === "all" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setActiveCategory("all")}
                            >
                              All
                            </Button>
                            {catalog?.categories.map((category) => (
                              <Button
                                key={category.id}
                                variant={
                                  activeCategory === category.id ? "default" : "outline"
                                }
                                size="sm"
                                onClick={() => {
                                  setActiveCategory(category.id);
                                  setOpenCategories((previous) => {
                                    const next = new Set(previous);
                                    next.add(category.id);
                                    return next;
                                  });
                                }}
                              >
                                {category.label}
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
                            Platform
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant={activePlatform === "all" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setActivePlatform("all")}
                            >
                              All
                            </Button>
                            {platforms.map((platform) => (
                              <Button
                                key={platform}
                                variant={activePlatform === platform ? "default" : "outline"}
                                size="sm"
                                onClick={() => setActivePlatform(platform)}
                              >
                                {platform}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-border/70 bg-background/70 shadow-xl shadow-black/10">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Filter className="h-4 w-4 text-cyan-300" />
                          Result snapshot
                        </CardTitle>
                        <CardDescription>
                          Counts update live as you narrow the catalog.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="rounded-2xl border border-border/70 bg-black/20 p-4">
                          <div className="text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
                            Visible items
                          </div>
                          <div className="mt-2 text-3xl font-black text-foreground">
                            {filteredItems.length.toLocaleString()}
                          </div>
                        </div>

                        {activeCategorySummary ? (
                          <div className="rounded-2xl border border-border/70 bg-black/20 p-4 text-sm text-muted-foreground">
                            <div className="font-semibold text-foreground">
                              {activeCategorySummary.label}
                            </div>
                            <p className="mt-2 leading-6">
                              {activeCategorySummary.description}
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-border/70 bg-black/20 p-4 text-sm leading-6 text-muted-foreground">
                            Switch categories or search for a specific template family. The page keeps the
                            heavy JSON payload behind each item until you open it.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-6">
                    {loading ? (
                      <Card className="border-border/70 bg-background/70 shadow-xl shadow-black/10">
                        <CardContent className="flex min-h-[360px] items-center justify-center gap-3">
                          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
                          <span className="text-sm text-muted-foreground">
                            Indexing the template catalog...
                          </span>
                        </CardContent>
                      </Card>
                    ) : error ? (
                      <Card className="border-destructive/40 bg-background/70 shadow-xl shadow-black/10">
                        <CardContent className="space-y-4 p-6">
                          <h2 className="text-lg font-semibold text-foreground">
                            Could not load the template catalog
                          </h2>
                          <p className="text-sm leading-6 text-muted-foreground">{error}</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {catalog?.categories.map((category) => {
                            const visibleCount = filteredItems.filter(
                              (item) => item.category === category.id
                            ).length;

                            return (
                              <button
                                key={category.id}
                                type="button"
                                onClick={() => {
                                  setActiveCategory(category.id);
                                  setOpenCategories((previous) => {
                                    const next = new Set(previous);
                                    next.add(category.id);
                                    return next;
                                  });
                                }}
                                className={`group relative overflow-hidden rounded-2xl border border-border/70 bg-background/70 p-5 text-left shadow-xl shadow-black/10 transition-transform hover:-translate-y-0.5 ${
                                  activeCategory === category.id ? "ring-1 ring-cyan-400/50" : ""
                                }`}
                              >
                                <div
                                  className={`absolute inset-0 bg-gradient-to-br ${CATEGORY_ACCENTS[category.id]} opacity-80`}
                                />
                                <div className="relative space-y-3">
                                  <div className="flex items-center justify-between gap-4">
                                    <div className="text-lg font-semibold text-foreground">
                                      {category.label}
                                    </div>
                                    <div className="rounded-full border border-border/70 bg-black/20 px-3 py-1 text-xs font-mono text-muted-foreground">
                                      {visibleCount}/{category.count}
                                    </div>
                                  </div>
                                  <p className="text-sm leading-6 text-muted-foreground">
                                    {category.description}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/70 px-5 py-4 shadow-xl shadow-black/10 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
                              Inspection mode
                            </div>
                            <div className="mt-2 text-sm leading-6 text-muted-foreground">
                              Summaries show the import-ready payload. Expand any row to inspect the exact JSON
                              the app will use.
                            </div>
                          </div>
                          <Button asChild variant="outline">
                            <Link href="/wizard">
                              Open the wizard
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>

                        <div className="space-y-4">
                          {groupedItems.length === 0 ? (
                            <Card className="border-border/70 bg-background/70 shadow-xl shadow-black/10">
                              <CardContent className="space-y-3 p-6">
                                <div className="text-lg font-semibold text-foreground">
                                  No matching templates
                                </div>
                                <p className="text-sm leading-6 text-muted-foreground">
                                  Try a broader search term or clear the active category and platform filters.
                                </p>
                              </CardContent>
                            </Card>
                          ) : (
                            groupedItems.map(({ category, items }) => {
                              const categorySummary = catalog?.categories.find(
                                (entry) => entry.id === category
                              );
                              const isOpen = openCategories.has(category);
                              const renderedItems = items.slice(
                                0,
                                visibleItems[category] ?? INITIAL_VISIBLE_ITEMS
                              );
                              const hasMore =
                                renderedItems.length < items.length;

                              return (
                                <Card
                                  key={category}
                                  className="overflow-hidden border-border/70 bg-background/70 shadow-xl shadow-black/10"
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleCategory(category)}
                                    className="w-full border-b border-border/60 bg-black/10 px-6 py-5 text-left"
                                  >
                                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                                      <div className="space-y-2">
                                        <div className="text-xs font-mono uppercase tracking-[0.26em] text-muted-foreground">
                                          {categorySummary?.label}
                                        </div>
                                        <div className="text-2xl font-black text-foreground">
                                          {items.length.toLocaleString()} matching item
                                          {items.length === 1 ? "" : "s"}
                                        </div>
                                        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                                          {categorySummary?.description}
                                        </p>
                                      </div>
                                      <div className="rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs font-mono text-muted-foreground">
                                        {isOpen ? "Collapse" : "Expand"}
                                      </div>
                                    </div>
                                  </button>

                                  {isOpen ? (
                                    <CardContent className="p-0">
                                      <Accordion
                                        type="single"
                                        collapsible
                                        className="w-full"
                                        onValueChange={(value) => {
                                          const item = renderedItems.find(
                                            (entry) => entry.id === value
                                          );
                                          if (item) {
                                            void ensurePayload(item);
                                          }
                                        }}
                                      >
                                        {renderedItems.map((item) => {
                                          const payloadState = payloadStates[item.id];
                                          const highlights = buildHighlights(payloadState?.data);

                                          return (
                                            <AccordionItem
                                              key={item.id}
                                              value={item.id}
                                              className="border-b border-border/60 px-6"
                                            >
                                              <AccordionTrigger className="hover:no-underline">
                                                <div className="flex w-full flex-col gap-3 pr-6 text-left">
                                                  <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-base font-semibold text-foreground">
                                                      {item.displayName}
                                                    </span>
                                                    <span className="rounded-full border border-border/70 bg-black/20 px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                                                      {item.itemType}
                                                    </span>
                                                    {item.platform ? (
                                                      <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-cyan-200">
                                                        {item.platform}
                                                      </span>
                                                    ) : null}
                                                    {item.subcategory ? (
                                                      <span className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                                                        {item.subcategory}
                                                      </span>
                                                    ) : null}
                                                  </div>
                                                  <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
                                                    {item.description}
                                                  </p>
                                                  {item.sourcePath ? (
                                                    <div className="font-mono text-xs text-muted-foreground">
                                                      {item.sourcePath}
                                                    </div>
                                                  ) : null}
                                                </div>
                                              </AccordionTrigger>
                                              <AccordionContent className="space-y-5 pb-6">
                                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                                  <div className="rounded-2xl border border-border/60 bg-black/20 p-4">
                                                    <div className="text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
                                                      Category
                                                    </div>
                                                    <div className="mt-2 text-sm font-semibold text-foreground">
                                                      {item.categoryLabel}
                                                    </div>
                                                  </div>
                                                  <div className="rounded-2xl border border-border/60 bg-black/20 p-4">
                                                    <div className="text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
                                                      Type
                                                    </div>
                                                    <div className="mt-2 text-sm font-semibold text-foreground">
                                                      {item.itemType}
                                                    </div>
                                                  </div>
                                                  <div className="rounded-2xl border border-border/60 bg-black/20 p-4">
                                                    <div className="text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
                                                      Platform
                                                    </div>
                                                    <div className="mt-2 text-sm font-semibold text-foreground">
                                                      {item.platform ?? "General"}
                                                    </div>
                                                  </div>
                                                  <div className="rounded-2xl border border-border/60 bg-black/20 p-4">
                                                    <div className="text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
                                                      Source
                                                    </div>
                                                    <div className="mt-2 text-sm font-semibold text-foreground">
                                                      {item.sourcePath ? "Manifest-backed" : "Bundled payload"}
                                                    </div>
                                                  </div>
                                                </div>

                                                {payloadState?.status === "loading" ? (
                                                  <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-black/20 p-4 text-sm text-muted-foreground">
                                                    <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                                                    Loading raw JSON for this template...
                                                  </div>
                                                ) : null}

                                                {payloadState?.status === "error" ? (
                                                  <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-muted-foreground">
                                                    {payloadState.error}
                                                  </div>
                                                ) : null}

                                                {payloadState?.status === "ready" ? (
                                                  <>
                                                    {highlights.length > 0 ? (
                                                      <div className="space-y-3">
                                                        <div className="text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
                                                          Human-readable summary
                                                        </div>
                                                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                                          {highlights.map((highlight) => (
                                                            <div
                                                              key={`${item.id}-${highlight.label}`}
                                                              className="rounded-2xl border border-border/60 bg-black/20 p-4"
                                                            >
                                                              <div className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
                                                                {highlight.label}
                                                              </div>
                                                              <div className="mt-2 break-words text-sm font-medium text-foreground">
                                                                {highlight.value}
                                                              </div>
                                                            </div>
                                                          ))}
                                                        </div>
                                                      </div>
                                                    ) : null}

                                                    <div className="space-y-3">
                                                      <div className="flex items-center justify-between gap-3">
                                                        <div className="text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
                                                          Raw JSON
                                                        </div>
                                                        <Button
                                                          variant="outline"
                                                          size="sm"
                                                          onClick={() => void copyPayload(item.id)}
                                                        >
                                                          <Copy className="h-4 w-4" />
                                                          Copy
                                                        </Button>
                                                      </div>
                                                      <div className="overflow-hidden rounded-2xl border border-border/70 bg-[#050816]">
                                                        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs font-mono uppercase tracking-[0.24em] text-slate-400">
                                                          <span className="flex items-center gap-2">
                                                            <FileCode2 className="h-3.5 w-3.5" />
                                                            Import-ready payload
                                                          </span>
                                                          <span>{item.itemType}</span>
                                                        </div>
                                                        <pre className="max-h-[480px] overflow-auto p-4 text-xs leading-6 text-slate-200 selection:bg-cyan-400/20">
                                                          <code className="font-mono">
                                                            {renderHighlightedJson(payloadState.data)}
                                                          </code>
                                                        </pre>
                                                      </div>
                                                    </div>
                                                  </>
                                                ) : null}
                                              </AccordionContent>
                                            </AccordionItem>
                                          );
                                        })}
                                      </Accordion>

                                      {hasMore ? (
                                        <div className="border-t border-border/60 p-6">
                                          <Button variant="outline" onClick={() => showMoreItems(category)}>
                                            Show {Math.min(VISIBLE_ITEMS_INCREMENT, items.length - renderedItems.length)} more
                                          </Button>
                                        </div>
                                      ) : null}
                                    </CardContent>
                                  ) : null}
                                </Card>
                              );
                            })
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
