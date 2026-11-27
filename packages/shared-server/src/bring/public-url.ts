import { SERVER_CONFIG } from "@norish/config/env-config-server";
import { addressesOf, isPrivate } from "@norish/shared-server/private-addresses";

/** Bring!'s own API. A different BRING_API_URL means a test double or a proxy stands in for it. */
const DEFAULT_BRING_API_URL = "https://api.getbring.com";

/** Whether Bring!'s real API is the one in use, as opposed to a test double or a proxy. */
export function usesDefaultBringApi(): boolean {
  let base = SERVER_CONFIG.BRING_API_URL;

  while (base.endsWith("/")) base = base.slice(0, -1);

  return base === DEFAULT_BRING_API_URL;
}

/** AUTH_URL without a trailing slash: the origin and base path every public link starts from. */
export function publicBaseUrl(): string {
  let base = SERVER_CONFIG.AUTH_URL;

  while (base.endsWith("/")) base = base.slice(0, -1);

  return base;
}

/** The page Bring!'s servers fetch for a handoff. */
export function handoffUrl(token: string): string {
  return `${publicBaseUrl()}/share/bring/${token}`;
}

/**
 * Whether Bring!'s servers can plausibly reach this instance: AUTH_URL is https and is not, and
 * does not resolve to, a private address. The check is skipped only when BRING_API_URL points
 * somewhere other than Bring! (a test double or a proxy), whose fetch need not come from the internet.
 */
export async function isPubliclyReachable(): Promise<boolean> {
  if (!usesDefaultBringApi()) return true;

  const url = new URL(SERVER_CONFIG.AUTH_URL);

  if (url.protocol !== "https:") return false;

  const addresses = await addressesOf(url.hostname).catch(() => null);

  return addresses !== null && addresses.length > 0 && !addresses.some(isPrivate);
}
