"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";

function getNextTheme(resolvedTheme?: string): "light" | "dark" {
  if (resolvedTheme === "dark") {
    return "light";
  }

  return "dark";
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { updateSettings } = useSettings();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="rounded-full w-9 h-9">
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  const nextTheme = getNextTheme(resolvedTheme);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full w-9 h-9"
      onClick={() => {
        setTheme(nextTheme);
        updateSettings({ theme: nextTheme });
      }}
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
