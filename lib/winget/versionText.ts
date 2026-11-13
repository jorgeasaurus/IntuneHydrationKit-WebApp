/**
 * Characters that a pinned WinGet version can have. The version goes into a winget command line
 * and into single-quoted PowerShell strings, so spaces, quotes, and shell characters are not allowed.
 */
export const PINNABLE_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
