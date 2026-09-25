/** Keep recovery available at the public app launcher without covering account forms. */
export function showsPwaWorkspaceControls(pathname: string | null): boolean {
  return (
    pathname === "/aplicacion" ||
    pathname === "/dashboard" ||
    Boolean(pathname?.startsWith("/dashboard/"))
  );
}
