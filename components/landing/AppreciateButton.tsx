"use client";

import { createElement, useEffect, useState } from "react";
import Script from "next/script";

/**
 * Render the configured appreciation widget on the landing page.
 *
 * The third-party script loads only when this page is the top-level document.
 * MSAL's silent token renewal loads the landing page (the redirect URI) in a
 * hidden same-origin iframe, and that iframe shares sessionStorage, where MSAL
 * keeps tokens, with the wizard and dashboard. No third-party code runs there.
 */
export function AppreciateButton() {
  const [isTopLevel, setIsTopLevel] = useState(false);

  useEffect(() => {
    setIsTopLevel(window.self === window.top);
  }, []);

  return (
    <div className="flex items-center justify-center gap-3 text-sm text-white">
      <span>Find this useful?</span>
      {createElement("appreciate-button", {
        "data-key": "pk_c440eace02dec266630193de97790e55",
        "data-label": "Appreciate Intune Hydration Kit",
        class: "appreciate-widget",
      })}
      {isTopLevel && (
        <Script
          src="https://appreciate-button.com/widget.js"
          strategy="afterInteractive"
        />
      )}
    </div>
  );
}
