import { randomBytes } from "node:crypto";
import { z } from "zod";

import { getPublisherClient } from "@norish/shared-server/valkey/client";

/**
 * A Bring Handoff lives an hour. Bring!'s servers may read the page again after the
 * first fetch, so reading it does not delete it.
 */
export const BRING_HANDOFF_TTL_SECONDS = 3600;

const KEY_PREFIX = "norish:bring:handoff:";

/** What the public page shows, and nothing else: no user, household or recipe id. */
const HandoffSchema = z.object({
  title: z.string(),
  servings: z.number(),
  lines: z.array(z.string()),
  createdAt: z.number(),
});

export type BringHandoff = z.infer<typeof HandoffSchema>;

/** Stores the lines under an unguessable token and returns the token. */
export async function createHandoff(
  handoff: Pick<BringHandoff, "title" | "servings" | "lines">
): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const record: BringHandoff = {
    title: handoff.title,
    servings: handoff.servings,
    lines: handoff.lines,
    createdAt: Date.now(),
  };
  const valkey = await getPublisherClient();

  await valkey.set(
    `${KEY_PREFIX}${token}`,
    JSON.stringify(record),
    "EX",
    BRING_HANDOFF_TTL_SECONDS
  );

  return token;
}

/** Removes a handoff that was never handed to Bring!, so its page does not outlive the failed send. */
export async function deleteHandoff(token: string): Promise<void> {
  const valkey = await getPublisherClient();

  await valkey.del(`${KEY_PREFIX}${token}`);
}

/** The stored handoff, or null when the token is unknown or expired. */
export async function readHandoff(token: string): Promise<BringHandoff | null> {
  const valkey = await getPublisherClient();
  const raw = await valkey.get(`${KEY_PREFIX}${token}`);

  if (!raw) return null;

  try {
    const parsed = HandoffSchema.safeParse(JSON.parse(raw));

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
