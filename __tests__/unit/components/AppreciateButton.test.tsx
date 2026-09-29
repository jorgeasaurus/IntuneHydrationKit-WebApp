import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppreciateButton } from "@/components/landing/AppreciateButton";

const { scriptProps } = vi.hoisted(() => ({ scriptProps: vi.fn() }));
vi.mock("next/script", () => ({
  default: (props: Record<string, unknown>) => {
    scriptProps(props);
    return null;
  },
}));

describe("AppreciateButton", () => {
  it("provides the site key and accessible label to the widget loaded after hydration", () => {
    const { container } = render(<AppreciateButton />);
    expect(screen.getByText("Find this useful?")).toBeVisible();
    const widget = container.querySelector("appreciate-button");
    expect(widget).toHaveAttribute("data-key", "pk_c440eace02dec266630193de97790e55");
    expect(widget).toHaveAttribute("data-label", "Appreciate Intune Hydration Kit");
    expect(widget).toHaveClass("appreciate-widget");
    expect(scriptProps).toHaveBeenCalledWith({
      src: "https://appreciate-button.com/widget.js",
      strategy: "afterInteractive",
    });
  });
});
