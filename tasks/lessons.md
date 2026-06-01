# Lessons

- When a tenant-only Graph create error cannot be fully reproduced locally, add scoped failure diagnostics at the Graph response boundary so the next generic 400 includes task, endpoint, API version, response body, and sanitized payload.
- For Microsoft Graph batch errors, preserve `error.innerError.message`; Graph often puts the actionable cause there while the outer message stays generic.
- For ARIA boolean attributes, avoid undefined-returning expressions; use explicit booleans so axe tooling sees valid `true`/`false` values.
- When the user provides a specific visual effect URL, implement that named effect and options directly before inventing a lookalike.
- For global decorative wallpapers, verify every supported theme; a dark canvas behind light-mode text needs a theme-aware scrim or it will break contrast.
- When buttons sit over a busy animated backdrop, check mobile `scrollWidth` against `clientWidth`; duplicated icon margins can create small but visible text overflow.
- When a user asks for all landing buttons to match a style, include nav CTAs and button-like demo actions in the audit, not just the primary hero row.
- Small version/status chips over animated blue backdrops need the same contrast audit as buttons; blue text on translucent blue can fail visually even when it matches the brand.
- Modal actions opened from landing CTAs are part of the same visual surface; audit portal-rendered dialogs for leftover primary-blue buttons too.
- Run `next build` and `tsc --noEmit` sequentially; running them together can race over `.next/types` and produce false missing-file errors.
- Destructive warning banners over animated blue backdrops need filled dark surfaces; transparent red text and borders do not provide enough perceived contrast.
- Template documentation category cards should not display live fraction counts; stale manifest counts create visual noise and make category quality look broken.
- Category-card buttons in stretched CSS grids need explicit top alignment; short descriptions can otherwise appear vertically centered next to taller cards.
- Playwright e2e should use a dedicated local port by default; reusing any existing localhost server can accidentally validate the wrong app.
- Theme toggles must prefer a persisted non-system app setting over `next-themes` reporting `system`; otherwise dark settings on a light OS can never cycle back to light.
- For theme regressions, verify the visible screen state with Playwright screenshots and computed styles; HTML class/storage assertions alone can miss a dark-looking light mode.
