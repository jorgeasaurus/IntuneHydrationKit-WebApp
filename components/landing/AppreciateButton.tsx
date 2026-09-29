"use client";

import { createElement } from "react";
import Script from "next/script";

/** Render the configured appreciation widget on the landing page. */
export function AppreciateButton() {
  return (
    <div className="flex items-center justify-center gap-3 text-sm text-white">
      <span>Find this useful?</span>
      {createElement("appreciate-button", {
        "data-key": "pk_c440eace02dec266630193de97790e55",
        "data-label": "Appreciate Intune Hydration Kit",
        className: "appreciate-widget",
      })}
      <Script
        src="https://appreciate-button.com/widget.js"
        strategy="afterInteractive"
      />
    </div>
  );
}
