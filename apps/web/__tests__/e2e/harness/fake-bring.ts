/**
 * Bring!, served by the harness. The browser tests never reach the real service: it would need the
 * instance on the public internet, and it would be someone else's servers fetching our page.
 *
 * It answers what Bring! answers `POST /rest/bringrecipes/deeplink` with, and, as Bring!'s own
 * servers do, fetches the page it was given at once and with no cookie, so the request is the proof
 * that the page needs no session. `refuse()` makes it answer 403, which is what the real service
 * says when it cannot read the page.
 */
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

export interface BringRequestBody {
  url: string;
  baseQuantity?: number;
  requestedQuantity?: number;
  source?: string;
}

export interface BringRequest {
  /** The JSON body the instance sent. */
  body: BringRequestBody;
  /** The status the fake got fetching `body.url` with no cookie. */
  pageStatus: number;
  /** The HTML it got. */
  pageHtml: string;
}

export interface FakeBring {
  /** The address to give the server as `BRING_API_URL`. */
  url: string;
  /** Every deeplink request, in order. */
  requests: BringRequest[];
  /** The paths of the deeplink pages that were opened, in order. */
  opened: string[];
  /** Answer 403 from now on, as Bring! does when it cannot read the page. */
  refuse: () => void;
  /** Answer as usual again, and forget what was recorded. */
  reset: () => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.once("error", reject);
  });
}

export function createFakeBring(): FakeBring {
  const requests: BringRequest[] = [];
  const opened: string[] = [];
  let refusing = false;
  let server: Server | null = null;
  let url = "";

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const path = request.url ?? "/";

    if (request.method === "POST" && path === "/rest/bringrecipes/deeplink") {
      const body = JSON.parse(await readBody(request)) as BringRequestBody;
      // No cookie, no header of ours: this is a stranger on the internet.
      const page = await fetch(body.url);
      const pageHtml = await page.text();

      requests.push({ body, pageStatus: page.status, pageHtml });

      if (refusing) {
        response.writeHead(403, { "content-type": "application/json" });
        response.end(JSON.stringify({ message: "Forbidden" }));

        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ deeplink: `${url}/deeplink/${requests.length}` }));

      return;
    }

    if (request.method === "GET" && path.startsWith("/deeplink/")) {
      opened.push(path);
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>Bring!</title><h1>Bring! (fake)</h1>");

      return;
    }

    response.writeHead(404).end();
  }

  return {
    get url() {
      return url;
    },
    requests,
    opened,
    refuse: () => {
      refusing = true;
    },
    reset: () => {
      refusing = false;
      requests.length = 0;
      opened.length = 0;
    },
    start: () =>
      new Promise((resolve, reject) => {
        const created = createServer((request, response) => {
          void handle(request, response).catch(() => {
            if (!response.headersSent) response.writeHead(500);
            response.end();
          });
        });

        created.once("error", reject);
        created.listen(0, "127.0.0.1", () => {
          const address = created.address();

          if (typeof address === "string" || address === null) {
            reject(new Error("The fake Bring! did not get a port"));

            return;
          }
          server = created;
          url = `http://127.0.0.1:${address.port}`;
          resolve();
        });
      }),
    stop: () =>
      new Promise((resolve, reject) => {
        if (!server) {
          resolve();

          return;
        }
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
        server = null;
      }),
  };
}
