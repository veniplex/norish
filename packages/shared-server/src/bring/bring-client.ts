import { z } from "zod";

import { SERVER_CONFIG } from "@norish/config/env-config-server";
import { usesDefaultBringApi } from "@norish/shared-server/bring/public-url";
import { createLogger } from "@norish/shared-server/logger";

const log = createLogger("bring");

const REQUEST_TIMEOUT_MS = 10_000;

const DeeplinkResponseSchema = z.object({ deeplink: z.url({ protocol: /^https?$/ }) });

type DeeplinkResult =
  { ok: true; deeplink: string } | { ok: false; reason: "bring-unreachable" | "bring-rejected" };

/**
 * Asks Bring! for the deeplink that imports the recipe page at `url`. Bring!'s
 * servers fetch that page themselves. Neither the page URL nor its token is logged.
 */
export async function requestDeeplink({
  url,
  servings,
}: {
  url: string;
  servings?: number;
}): Promise<DeeplinkResult> {
  const quantity = String(Math.max(1, Math.round(servings ?? 1)));
  let response: Response;

  try {
    response = await fetch(`${SERVER_CONFIG.BRING_API_URL}/rest/bringrecipes/deeplink`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        url,
        baseQuantity: quantity,
        requestedQuantity: quantity,
        source: "web",
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
  } catch {
    log.warn("Bring! could not be reached");

    return { ok: false, reason: "bring-unreachable" };
  }

  if (response.status >= 500) {
    log.warn({ status: response.status }, "Bring! failed");

    return { ok: false, reason: "bring-unreachable" };
  }

  if (!response.ok) {
    log.warn({ status: response.status }, "Bring! refused the recipe");

    return { ok: false, reason: "bring-rejected" };
  }

  const body = DeeplinkResponseSchema.safeParse(await response.json().catch(() => null));

  // Bring!'s own deeplink is https; only a test double configured through BRING_API_URL may answer http.
  const scheme = body.success ? new URL(body.data.deeplink).protocol : null;

  if (!body.success || (scheme !== "https:" && (scheme !== "http:" || usesDefaultBringApi()))) {
    log.warn("Bring! answered without a deeplink");

    return { ok: false, reason: "bring-rejected" };
  }

  return { ok: true, deeplink: body.data.deeplink };
}

type ImportCheck =
  | { ok: true }
  | { ok: false; reason: "page-unreachable"; status?: number }
  | { ok: false; reason: "bring-unreachable" | "bring-rejected" };

/** The status Bring!'s parser got from the page, as its error detail reports it ("httpStatus=403"). */
function pageStatusIn(detail: string): number | undefined {
  const found = /httpStatus=(\d{3})/.exec(detail);

  return found ? Number(found[1]) : undefined;
}

/**
 * Asks Bring!'s recipe parser to read the page at `url` now, as it will when the reader opens the
 * deeplink. Asking for the deeplink alone proves nothing: Bring! reads the page only when the link
 * is opened, so a page its servers cannot fetch would fail there, on Bring!'s side, with no reason.
 * Neither the page URL nor its token is logged.
 */
export async function checkImport({
  url,
  servings,
}: {
  url: string;
  servings?: number;
}): Promise<ImportCheck> {
  const quantity = String(Math.max(1, Math.round(servings ?? 1)));
  const query = new URLSearchParams({ url, baseQuantity: quantity, requestedQuantity: quantity });
  let response: Response;

  try {
    response = await fetch(`${SERVER_CONFIG.BRING_API_URL}/rest/bringrecipes/parser?${query}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
  } catch {
    log.warn("Bring!'s recipe parser could not be reached");

    return { ok: false, reason: "bring-unreachable" };
  }

  if (response.ok) return { ok: true };

  if (response.status >= 500) {
    log.warn({ status: response.status }, "Bring!'s recipe parser failed");

    return { ok: false, reason: "bring-unreachable" };
  }

  const text = await response.text().catch(() => "");

  // Bring! could not fetch the page: its detail names the status our server gave it.
  if (/not reachable/i.test(text)) {
    const status = pageStatusIn(text);

    log.warn({ pageStatus: status ?? null }, "Bring! could not fetch the handoff page");

    return status === undefined
      ? { ok: false, reason: "page-unreachable" }
      : { ok: false, reason: "page-unreachable", status };
  }

  // It fetched the page and found no recipe in it; its message ("invalid recipe parsed: no
  // ingredients found") carries no URL, so it is safe to log.
  log.warn(
    { status: response.status, message: text.slice(0, 200) },
    "Bring! could not read the handoff page"
  );

  return { ok: false, reason: "bring-rejected" };
}
