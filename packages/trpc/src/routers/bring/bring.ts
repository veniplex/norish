import { TRPCError } from "@trpc/server";

import { valkeySecondaryStorage } from "@norish/auth/secondary-storage";
import { getRecipeName } from "@norish/db/repositories/recipes";
import { requestDeeplink } from "@norish/shared-server/bring/bring-client";
import { formatBringLine } from "@norish/shared-server/bring/format-line";
import { createHandoff, deleteHandoff } from "@norish/shared-server/bring/handoff-store";
import { handoffUrl, isPubliclyReachable } from "@norish/shared-server/bring/public-url";
import { getGroceryListProvider } from "@norish/shared-server/config/server-config-loader";
import { trpcLogger as log } from "@norish/shared-server/logger";
import { SendToBringInputSchema, type SendToBringResult } from "@norish/shared/contracts/zod/bring";

import { authedProcedure } from "../../middleware";
import { router } from "../../trpc";
import { assertRecipeAccess } from "../recipes/helpers";

const SENDS_PER_WINDOW = 30;
const WINDOW_SECONDS = 10 * 60;
const FALLBACK_TITLE = "Norish";

/**
 * Hand the lines to Bring!: store them behind a short-lived public page, ask Bring! for the
 * deeplink that imports it, and return the link. Expected failures come back as a reason,
 * not as an error.
 */
const send = authedProcedure
  .input(SendToBringInputSchema)
  .mutation(async ({ ctx, input }): Promise<SendToBringResult> => {
    if ((await getGroceryListProvider()) !== "bring") {
      return { ok: false, reason: "not-bring" };
    }

    // An item whose name is empty once trimmed is ignored; a send with none left has nothing to say.
    const items = input.items.filter((item) => item.name.length > 0);

    if (items.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No usable item to send" });
    }

    let title = input.title ?? FALLBACK_TITLE;

    if (input.recipeId) {
      await assertRecipeAccess(ctx, input.recipeId, "view");
      title = (await getRecipeName(input.recipeId)) ?? title;
    }

    if (!(await isPubliclyReachable())) {
      return { ok: false, reason: "not-public" };
    }

    // Counted last, so a refusal that costs nothing does not use up the quota.
    const sends = await valkeySecondaryStorage.increment(
      `bring-send-rate:${ctx.user.id}`,
      WINDOW_SECONDS
    );

    if (sends > SENDS_PER_WINDOW) {
      log.warn({ userId: ctx.user.id }, "Bring send rate limited");

      return { ok: false, reason: "rate-limited" };
    }

    const token = await createHandoff({
      title,
      servings: input.servings ?? 1,
      lines: items.map(formatBringLine),
    });
    const result = await requestDeeplink({ url: handoffUrl(token), servings: input.servings });

    // A page Bring! never took has no reason to stay up for the hour.
    if (!result.ok) await deleteHandoff(token);

    log.info(
      { userId: ctx.user.id, lines: items.length, ok: result.ok },
      "Sent a shopping list to Bring!"
    );

    return result;
  });

export const bringRouter = router({ send });
