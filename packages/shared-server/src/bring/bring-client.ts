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
