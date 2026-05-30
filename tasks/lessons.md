# Lessons

- When a tenant-only Graph create error cannot be fully reproduced locally, add scoped failure diagnostics at the Graph response boundary so the next generic 400 includes task, endpoint, API version, response body, and sanitized payload.
- For Microsoft Graph batch errors, preserve `error.innerError.message`; Graph often puts the actionable cause there while the outer message stays generic.
