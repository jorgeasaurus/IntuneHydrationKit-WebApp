import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

interface NavigationBrandProps {
  showWordmark?: boolean;
  className?: string;
  href?: string | null;
}

export function NavigationBrand({
  showWordmark = false,
  className,
  href = "/",
}: NavigationBrandProps): React.JSX.Element {
  const content = (
    <>
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
    </>
  );

  const brandClassName = cn("group flex shrink-0 items-center gap-3", className);

  if (!href) {
    return (
      <div aria-label="Intune Hydration Kit" className={brandClassName}>
        {content}
      </div>
    );
  }

  return (
    <Link href={href} aria-label="Intune Hydration Kit home" className={brandClassName}>
      {content}
    </Link>
  );
}
