function shouldRenderWallpaper(pathname: string | null): boolean {
  return (
    pathname === "/" ||
    pathname === "/templates" ||
    pathname?.startsWith("/templates/") === true
  );
}

export { shouldRenderWallpaper };
