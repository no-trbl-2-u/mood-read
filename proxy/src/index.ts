// The Worker mood-read-proxy (proxy/wrangler.jsonc): GET /health answers 200 "ok"; anything else is a 404. The
// scoring proxy (01.2) grows here, on a target whose secrets `pnpm secrets:sync` already put in place.

export function handle(request: Request): Response {
  const { pathname } = new URL(request.url);
  if (request.method === "GET" && pathname === "/health") {
    return new Response("ok", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response("not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}

const worker = {
  fetch(request: Request): Response {
    return handle(request);
  },
};

export default worker;
