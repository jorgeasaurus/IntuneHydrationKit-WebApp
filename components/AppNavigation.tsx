import type { ReactNode } from "react";

import { NavigationBrand } from "@/components/NavigationBrand";

interface AppNavigationProps {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export function AppNavigation({
  eyebrow,
  title,
  description,
  actions,
}: AppNavigationProps): React.JSX.Element {
  return (
    <header className="app-glass-header-shell">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="app-glass-header">
          <div className="flex min-h-16 items-center gap-3 px-4 py-2 sm:gap-4 sm:px-6">
            <NavigationBrand />

            <div className="min-w-0 flex-1">
              {eyebrow && (
                <div className="hidden items-center gap-2 sm:flex">{eyebrow}</div>
              )}
              <h1 className="truncate text-base font-bold leading-tight tracking-tight sm:text-xl">
                {title}
              </h1>
              {description && (
                <p className="hidden truncate text-xs text-muted-foreground lg:block">
                  {description}
                </p>
              )}
            </div>

            {actions && (
              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                {actions}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
