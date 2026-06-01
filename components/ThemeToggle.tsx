"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Moon, Sun, TableProperties } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { AppSettings } from "@/types/hydration";

type SelectableTheme = Exclude<AppSettings["theme"], "system">;

const THEME_CYCLE: readonly SelectableTheme[] = ["light", "dark", "corporate-1999"];
const LIGHT_DARK_THEME_CYCLE: readonly SelectableTheme[] = ["light", "dark"];

interface ThemeToggleProps {
  themes?: readonly SelectableTheme[];
}

function subscribeToClientMount() {
  return () => {};
}

function getClientMountSnapshot() {
  return true;
}

function getServerMountSnapshot() {
  return false;
}

function getActiveTheme(
  theme: AppSettings["theme"] | undefined,
  resolvedTheme: string | undefined,
  themes: readonly SelectableTheme[]
): SelectableTheme {
  if (
    (theme === "light" ||
      theme === "dark" ||
      theme === "corporate-1999") &&
    themes.includes(theme)
  ) {
    return theme;
  }

  return resolvedTheme === "dark" ? "dark" : "light";
}

function getNextTheme(
  activeTheme: SelectableTheme,
  themes: readonly SelectableTheme[]
): SelectableTheme {
  const currentIndex = themes.indexOf(activeTheme);

  if (currentIndex === -1) {
    return themes[0];
  }

  return themes[(currentIndex + 1) % themes.length];
}

function getThemeActionIcon(nextTheme: SelectableTheme): React.JSX.Element {
  switch (nextTheme) {
    case "light":
      return <Sun className="size-4" />;
    case "dark":
      return <Moon className="size-4" />;
    case "corporate-1999":
      return <TableProperties className="size-4" />;
  }
}

export function ThemeToggle({
  themes = THEME_CYCLE,
}: ThemeToggleProps): React.JSX.Element {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { settings, updateSettings } = useSettings();
  const mounted = useSyncExternalStore(
    subscribeToClientMount,
    getClientMountSnapshot,
    getServerMountSnapshot
  );

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="rounded-full size-9">
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  const configuredTheme =
    settings.theme === "system"
      ? (theme as AppSettings["theme"] | undefined)
      : settings.theme;
  const activeTheme = getActiveTheme(configuredTheme, resolvedTheme, themes);
  const nextTheme = getNextTheme(activeTheme, themes);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full size-9"
      onClick={() => {
        setTheme(nextTheme);
        updateSettings({ theme: nextTheme });
      }}
    >
      {getThemeActionIcon(nextTheme)}
      <span className="sr-only">Cycle theme</span>
    </Button>
  );
}

export { LIGHT_DARK_THEME_CYCLE };
