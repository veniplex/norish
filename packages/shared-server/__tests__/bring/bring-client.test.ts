// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestDeeplink } from "@norish/shared-server/bring/bring-client";

const serverConfig = vi.hoisted(() => ({ BRING_API_URL: "https://api.getbring.com" }));

vi.mock("@norish/config/env-config-server", () => ({ SERVER_CONFIG: serverConfig }));
vi.mock("@norish/shared-server/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const fetchStub = vi.fn();

beforeEach(() => {
  serverConfig.BRING_API_URL = "https://api.getbring.com";
  vi.stubGlobal("fetch", fetchStub);
});

afterEach(() => {
  fetchStub.mockReset();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const unreachable = { ok: false, reason: "bring-unreachable" };
const rejected = { ok: false, reason: "bring-rejected" };
const page = { url: "https://n.example/x" };

describe("requestDeeplink", () => {
  it("posts the page url and servings to Bring! and returns the deeplink", async () => {
    fetchStub.mockResolvedValue(json({ deeplink: "https://getbring.onelink.me/abc" }));

    await expect(
      requestDeeplink({ url: "https://norish.example/share/bring/tok", servings: 3.6 })
    ).resolves.toEqual({ ok: true, deeplink: "https://getbring.onelink.me/abc" });

    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("https://api.getbring.com/rest/bringrecipes/deeplink");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({
      url: "https://norish.example/share/bring/tok",
      baseQuantity: "4",
      requestedQuantity: "4",
      source: "web",
    });
  });

  it("sends at least one serving", async () => {
    fetchStub.mockResolvedValue(json({ deeplink: "https://getbring.onelink.me/abc" }));

    await requestDeeplink(page);

    const [, init] = fetchStub.mock.calls[0] as [string, RequestInit];

    expect(JSON.parse(String(init.body))).toMatchObject({
      baseQuantity: "1",
      requestedQuantity: "1",
    });
  });

  it("reports a network error, a timeout and a 5xx as unreachable", async () => {
    fetchStub.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(requestDeeplink(page)).resolves.toEqual(unreachable);

    fetchStub.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    await expect(requestDeeplink(page)).resolves.toEqual(unreachable);

    fetchStub.mockResolvedValueOnce(json({}, 503));
    await expect(requestDeeplink(page)).resolves.toEqual(unreachable);
  });

  it("reports a 4xx and a body without a usable deeplink as rejected", async () => {
    fetchStub.mockResolvedValueOnce(json({ error: "bad" }, 400));
    await expect(requestDeeplink(page)).resolves.toEqual(rejected);

    fetchStub.mockResolvedValueOnce(json({ other: 1 }));
    await expect(requestDeeplink(page)).resolves.toEqual(rejected);

    fetchStub.mockResolvedValueOnce(json({ deeplink: "javascript:alert(1)" }));
    await expect(requestDeeplink(page)).resolves.toEqual(rejected);

    fetchStub.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    await expect(requestDeeplink(page)).resolves.toEqual(rejected);
  });

  describe("the deeplink's scheme", () => {
    it("accepts only https from Bring!'s own API", async () => {
      fetchStub.mockResolvedValueOnce(json({ deeplink: "http://getbring.onelink.me/abc" }));
      await expect(requestDeeplink(page)).resolves.toEqual(rejected);

      fetchStub.mockResolvedValueOnce(json({ deeplink: "ftp://getbring.onelink.me/abc" }));
      await expect(requestDeeplink(page)).resolves.toEqual(rejected);

      fetchStub.mockResolvedValueOnce(json({ deeplink: "https://getbring.onelink.me/abc" }));
      await expect(requestDeeplink(page)).resolves.toMatchObject({ ok: true });
    });

    it("accepts http only when BRING_API_URL points at a stand-in", async () => {
      serverConfig.BRING_API_URL = "http://localhost:4010";

      fetchStub.mockResolvedValueOnce(json({ deeplink: "http://localhost:4010/open" }));
      await expect(requestDeeplink(page)).resolves.toEqual({
        ok: true,
        deeplink: "http://localhost:4010/open",
      });

      fetchStub.mockResolvedValueOnce(json({ deeplink: "javascript:alert(1)" }));
      await expect(requestDeeplink(page)).resolves.toEqual(rejected);
    });
  });
});
