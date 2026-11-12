"use client";

import { Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

async function copyText(text: string, successMessage: string, failureMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error(failureMessage);
  }
}

/** Copies the URL of the current page. */
export function CopyLinkButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() =>
        void copyText(
          `${window.location.origin}${window.location.pathname}`,
          "Link copied to clipboard.",
          "Could not copy the link. Copy the URL from the address bar."
        )
      }
    >
      <Link2 className="size-4" aria-hidden="true" />
      Copy link
    </Button>
  );
}

interface CopyElementTextButtonProps {
  /** The id of the element whose text the button copies. */
  targetId: string;
  label: string;
  successMessage: string;
}

/**
 * Copies the text of another element on the page. The text is not sent to the
 * client a second time, so large JSON payloads stay small in the page data.
 */
export function CopyElementTextButton({
  targetId,
  label,
  successMessage,
}: CopyElementTextButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() =>
        void copyText(
          document.getElementById(targetId)?.textContent ?? "",
          successMessage,
          "Could not copy the text. Select the text and copy it manually."
        )
      }
    >
      <Copy className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
