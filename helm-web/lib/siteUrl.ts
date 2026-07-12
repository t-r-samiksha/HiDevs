/**
 * The canonical origin of this deployment, used to build auth redirect links
 * (e.g. the email-confirmation URL). Prefers NEXT_PUBLIC_SITE_URL so links are
 * correct even when signup is triggered from a non-browser origin; falls back
 * to the current browser origin, then localhost for local dev/SSR.
 *
 * Whatever this resolves to must also be allow-listed in Supabase:
 * Authentication → URL Configuration → Redirect URLs.
 */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, ""); // strip trailing slash(es)
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}
