export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { ...headers, Allow: "GET, HEAD" } });
    }
    let response;
    if (pathname === "/health") {
      response = Response.json({ status: "ok", service: "trucklink", commit: env.DEPLOY_COMMIT ?? "local" }, { headers });
    } else if (pathname === "/") {
      response = new Response("TruckLink\n项目环境已就绪，业务功能开发中。\n", {
        headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
      });
    } else {
      response = new Response("Not found", { status: 404, headers });
    }
    return request.method === "HEAD" ? new Response(null, response) : response;
  },
};
