import { useMutation } from "@tanstack/react-query";

import { MAX_BRING_ITEMS, type BRING_FAILURE_REASONS } from "@norish/shared/contracts/zod/bring";

import { usePlatform } from "../platform/platform";
import { useTRPC } from "../trpc";

/** A line to send: a name, and the amount and unit it is bought in when it has them. */
export type BringLine = { name: string; amount?: number | null; unit?: string | null };

/** What the lines are for: the recipe they come from, or a title, and the servings they are scaled to. */
export type BringContext = { recipeId?: string; title?: string; servings?: number };

/** The toast that says why Bring! did not take the lines, by the server's reason. */
const FAILURE_TITLES = {
  "not-bring": "groceries.bring.errors.failed",
  "not-public": "groceries.bring.errors.notPublic",
  "bring-unreachable": "groceries.bring.errors.unreachable",
  "bring-rejected": "groceries.bring.errors.rejected",
  "rate-limited": "groceries.bring.errors.rateLimited",
} as const satisfies Record<(typeof BRING_FAILURE_REASONS)[number], string>;

/**
 * Sends lines to Bring! and gets the reader there: a phone opens Bring! itself, the web offers a
 * button on a toast, whose press is the tap a browser needs to open a tab. Says how it failed;
 * resolves true only once Bring! took the lines.
 */
export function useSendToBring() {
  const trpc = useTRPC();
  const { toast, showError, openExternalUrl, opensExternalUrlUnprompted } = usePlatform();
  const { mutateAsync } = useMutation(trpc.bring.send.mutationOptions());

  return async (items: BringLine[], context: BringContext): Promise<boolean> => {
    // One odd line must not fail the send: a line with no name is left out, and a list longer than
    // a send carries goes as far as it can (the first lines, in the order picked).
    const usable = items.filter((item) => item.name.trim().length > 0).slice(0, MAX_BRING_ITEMS);

    if (usable.length === 0) {
      toast.show({
        severity: "warning",
        title: toast.translate("groceries.bring.errors.failed"),
      });

      return false;
    }

    try {
      const result = await mutateAsync({ ...context, items: usable });

      if (!result.ok) {
        toast.show({ severity: "warning", title: toast.translate(FAILURE_TITLES[result.reason]) });

        return false;
      }
      if (opensExternalUrlUnprompted) {
        openExternalUrl(result.deeplink);
      } else {
        toast.show({
          severity: "success",
          title: toast.translate("groceries.bring.ready"),
          actionLabel: toast.translate("groceries.bring.open"),
          onActionPress: () => openExternalUrl(result.deeplink),
          persistent: true,
        });
      }

      return true;
    } catch (error) {
      showError(error, "bring:send", toast.translate("groceries.bring.errors.failed"));

      return false;
    }
  };
}
