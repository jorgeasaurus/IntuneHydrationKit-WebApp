"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SIGN_IN_REQUIRED_PATH } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";

const SIGN_IN_REQUIRED_QUERY = new URLSearchParams(SIGN_IN_REQUIRED_PATH.split("?")[1] ?? "");
const [[SIGN_IN_PARAM, SIGN_IN_REQUIRED_VALUE]] = [...SIGN_IN_REQUIRED_QUERY.entries()];

interface SignInRequiredNoticeProps {
  isAuthenticated: boolean;
  onSignInClick: () => void;
}

/** Removes the sign-in hint from the URL, so a page refresh does not show the notice again. */
function removeSignInParam(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(SIGN_IN_PARAM);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function SignInRequiredNoticeContent({ isAuthenticated, onSignInClick }: SignInRequiredNoticeProps) {
  const searchParams = useSearchParams();
  const isRequested = searchParams.get(SIGN_IN_PARAM) === SIGN_IN_REQUIRED_VALUE;
  const [wasRequested, setWasRequested] = useState(false);
  const [visible, setVisible] = useState(false);

  // Show the notice when the hint arrives. The notice stays after the hint leaves the URL.
  if (isRequested !== wasRequested) {
    setWasRequested(isRequested);
    if (isRequested && !isAuthenticated) setVisible(true);
  }

  useEffect(() => {
    if (isRequested) removeSignInParam();
  }, [isRequested]);

  if (!visible || isAuthenticated) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-md flex-col gap-3 rounded-lg border border-sky-500/40 bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-start">
      <div className="flex-1 space-y-1">
        <p className="text-sm font-semibold">Sign in to continue to the wizard</p>
        <p className="text-sm text-muted-foreground">
          The wizard needs a Microsoft Entra sign-in. Sign in, then the wizard opens.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setVisible(false);
            onSignInClick();
          }}
        >
          Sign in
        </Button>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="rounded-md px-2 py-1 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Dismiss sign-in notice"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/**
 * Tells a signed-out visitor that the wizard needs sign-in. ProtectedRoute sends
 * the visitor to SIGN_IN_REQUIRED_PATH. The polite live region is in the page
 * HTML before the notice appears, so screen readers announce the notice.
 */
export function SignInRequiredNotice(props: SignInRequiredNoticeProps) {
  return (
    <div role="status" aria-live="polite">
      <Suspense fallback={null}>
        <SignInRequiredNoticeContent {...props} />
      </Suspense>
    </div>
  );
}
