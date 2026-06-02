const WALLPAPER_ROUTES = new Set([
  "/",
  "/wizard",
  "/dashboard",
  "/results",
  "/templates",
]);

function shouldRenderWallpaper(pathname: string | null): boolean {
  return (
    (pathname !== null && WALLPAPER_ROUTES.has(pathname)) ||
    pathname?.startsWith("/templates/") === true
  );
}

export { shouldRenderWallpaper };
