import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

interface NavigationBrandProps {
  showWordmark?: boolean;
  className?: string;
}

export function NavigationBrand({
  showWordmark = false,
  className,
}: NavigationBrandProps): React.JSX.Element {
  return (
    <Link
      href="/"
      aria-label="Intune Hydration Kit home"
      className={cn("group flex shrink-0 items-center gap-3", className)}
    >
      <span className="relative">
        <Image
          src="/IHTLogoClear.png"
          alt=""
          width={144}
          height={169}
          className="h-9 w-auto transition-transform group-hover:scale-105"
          style={{ width: "auto" }}
        />
        <span className="absolute inset-0 rounded-full bg-hydrate/20 opacity-0 blur-lg transition-opacity group-hover:opacity-100" />
      </span>
      {showWordmark && (
        <span
          aria-hidden="true"
          className="landing-nav-brand hidden text-xl font-bold leading-tight tracking-tight sm:block"
        >
          Intune Hydration Kit
        </span>
      )}
    </Link>
  );
}
