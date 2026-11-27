/** Sending lines to Bring!: how the reader gets there, and what each failure says. */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTestQueryClient,
  createTestWrapper,
  fakePlatformAdapter,
} from "@norish/shared-react/platform/testing";

import type { ExternalWindow } from "../../platform/platform";
import { resetTRPCFake, serveTRPC, trpcCalls } from "../../trpc/testing";
import { useSendToBring } from "../use-send-to-bring";

vi.mock("../../trpc", async () => (await import("../../trpc/testing")).mockTRPC());

afterEach(resetTRPCFake);

const DEEPLINK = "https://getbring.onelink.me/abc";
const ITEMS = [{ name: "flour", amount: 200, unit: "g" }];

function setup(unprompted = false, reserved: ExternalWindow | null = null) {
  const adapter = {
    ...fakePlatformAdapter(),
    opensExternalUrlUnprompted: unprompted,
    reserveExternalWindow: vi.fn(() => reserved),
  };
  const view = renderHook(() => useSendToBring(), {
    wrapper: createTestWrapper(createTestQueryClient(), adapter),
  });

  return { ...view, adapter };
}

describe("useSendToBring", () => {
  it("sends the items with the recipe and servings they are for", async () => {
    const answered = vi.fn(async () => ({ ok: true, deeplink: DEEPLINK }));

    serveTRPC(answered);
    const { result } = setup();

    await result.current(ITEMS, { recipeId: "r1", servings: 4 });

    expect(answered).toHaveBeenCalledWith("bring.send", {
      recipeId: "r1",
      servings: 4,
      items: ITEMS,
    });
  });

  describe("on the web, with the tab opened in the press", () => {
    const tab = () => ({ open: vi.fn(), close: vi.fn() });

    it("opens the tab before asking, sends it to the link, and shows no toast", async () => {
      const reserved = tab();
      let reservedBeforeAsking = false;

      const { result, adapter } = setup(false, reserved);

      serveTRPC(async () => {
        reservedBeforeAsking = vi.mocked(adapter.reserveExternalWindow).mock.calls.length === 1;

        return { ok: true, deeplink: DEEPLINK };
      });

      expect(await result.current(ITEMS, {})).toBe(true);

      expect(reservedBeforeAsking).toBe(true);
      expect(adapter.reserveExternalWindow).toHaveBeenCalledWith("groceries.bring.opening");
      expect(reserved.open).toHaveBeenCalledWith(DEEPLINK);
      expect(reserved.close).not.toHaveBeenCalled();
      expect(adapter.toast.show).not.toHaveBeenCalled();
    });

    it("closes the tab when Bring! did not take the lines, with the status it got", async () => {
      const reserved = tab();

      serveTRPC(async () => ({ ok: false, reason: "page-unreachable", status: 403 }));
      const { result, adapter } = setup(false, reserved);

      expect(await result.current(ITEMS, {})).toBe(false);

      expect(reserved.close).toHaveBeenCalled();
      expect(reserved.open).not.toHaveBeenCalled();
      expect(adapter.toast.show).toHaveBeenCalledWith({
        severity: "warning",
        title: "groceries.bring.errors.pageUnreachable",
        description: "groceries.bring.errors.pageStatus",
      });
    });

    it("closes the tab when the send threw", async () => {
      const reserved = tab();

      serveTRPC(async () => {
        throw new Error("offline");
      });
      const { result } = setup(false, reserved);

      expect(await result.current(ITEMS, {})).toBe(false);
      expect(reserved.close).toHaveBeenCalled();
    });
  });

  it("offers a persistent button whose press opens the link where the browser refused the tab", async () => {
    serveTRPC(async () => ({ ok: true, deeplink: DEEPLINK }));
    const { result, adapter } = setup();

    expect(await result.current(ITEMS, {})).toBe(true);

    expect(adapter.openExternalUrl).not.toHaveBeenCalled();
    expect(adapter.toast.show).toHaveBeenCalledWith({
      severity: "success",
      title: "groceries.bring.ready",
      actionLabel: "groceries.bring.open",
      onActionPress: expect.any(Function),
      persistent: true,
    });

    vi.mocked(adapter.toast.show).mock.calls[0]![0].onActionPress?.();
    expect(adapter.openExternalUrl).toHaveBeenCalledWith(DEEPLINK);
  });

  it("opens the link itself where the platform may, with no toast", async () => {
    serveTRPC(async () => ({ ok: true, deeplink: DEEPLINK }));
    const { result, adapter } = setup(true);

    expect(await result.current(ITEMS, {})).toBe(true);

    expect(adapter.openExternalUrl).toHaveBeenCalledWith(DEEPLINK);
    expect(adapter.reserveExternalWindow).not.toHaveBeenCalled();
    expect(adapter.toast.show).not.toHaveBeenCalled();
  });

  it.each([
    ["not-bring", "failed"],
    ["not-public", "notPublic"],
    ["bring-unreachable", "unreachable"],
    ["bring-rejected", "rejected"],
    ["rate-limited", "rateLimited"],
    ["page-unreachable", "pageUnreachable"],
  ])("warns with the %s reason and answers false", async (reason, key) => {
    serveTRPC(async () => ({ ok: false, reason }));
    const { result, adapter } = setup();

    expect(await result.current(ITEMS, {})).toBe(false);

    expect(adapter.toast.show).toHaveBeenCalledWith({
      severity: "warning",
      title: `groceries.bring.errors.${key}`,
    });
    expect(adapter.openExternalUrl).not.toHaveBeenCalled();
  });

  describe("one odd line does not fail the send", () => {
    it("leaves out a line with no name, and sends the rest", async () => {
      const answered = vi.fn(async () => ({ ok: true, deeplink: DEEPLINK }));

      serveTRPC(answered);
      const { result } = setup();

      await result.current([{ name: "  " }, { name: "salt", amount: 0 }, { name: "" }], {});

      expect(answered).toHaveBeenCalledWith("bring.send", { items: [{ name: "salt", amount: 0 }] });
    });

    it("sends the first 150 lines of a longer list", async () => {
      const answered = vi.fn(async () => ({ ok: true, deeplink: DEEPLINK }));

      serveTRPC(answered);
      const { result } = setup();
      const many = Array.from({ length: 200 }, (_, index) => ({ name: `item ${index}` }));

      await result.current(many, {});

      const sent = (answered.mock.calls[0] as unknown as [string, { items: { name: string }[] }])[1]
        .items;

      expect(sent).toHaveLength(150);
      expect(sent[0]).toEqual({ name: "item 0" });
      expect(sent[149]).toEqual({ name: "item 149" });
    });

    it("asks nothing, and says so, when no line has a name", async () => {
      const answered = vi.fn();

      serveTRPC(answered);
      const { result, adapter } = setup();

      expect(await result.current([{ name: " " }], {})).toBe(false);

      expect(answered).not.toHaveBeenCalled();
      expect(adapter.toast.show).toHaveBeenCalledWith({
        severity: "warning",
        title: "groceries.bring.errors.failed",
      });
    });
  });

  it("shows a thrown error, offline included, and answers false", async () => {
    const offline = new Error("offline");

    serveTRPC(async () => {
      throw offline;
    });
    const { result, adapter } = setup();

    expect(await result.current(ITEMS, {})).toBe(false);

    expect(adapter.showError).toHaveBeenCalledWith(
      offline,
      "bring:send",
      "groceries.bring.errors.failed"
    );
    expect(trpcCalls).toEqual({});
  });
});
