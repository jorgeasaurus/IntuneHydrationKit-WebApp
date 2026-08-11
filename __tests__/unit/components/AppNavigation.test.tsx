import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@testing-library/react";
import { AppNavigation } from "@/components/AppNavigation";

vi.mock("next/image", () => ({
  default: () => null,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("AppNavigation", () => {
  it("uses the shared landing-style shell without hiding contextual controls", () => {
    render(
      <AppNavigation
        eyebrow={<span>Run evidence</span>}
        title="Execution Results"
        description="Delete operation completed"
        actions={<button type="button">Start New Hydration</button>}
      />,
    );

    const banner = screen.getByRole("banner");
    const widthFrame = banner.firstElementChild;
    const glassSurface = widthFrame?.firstElementChild;

    expect(banner).toHaveClass("app-glass-header-shell");
    expect(widthFrame).toHaveClass("container", "mx-auto", "px-4", "sm:px-6");
    expect(glassSurface).toHaveClass("app-glass-header");
    expect(
      screen.getByRole("link", { name: "Intune Hydration Kit home" }),
    ).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("heading", { name: "Execution Results" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Run evidence")).toBeInTheDocument();
    expect(screen.getByText("Delete operation completed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start New Hydration" }),
    ).toBeInTheDocument();
  });
});
