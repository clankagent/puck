// Headless smoke of built ESM with synthetic reports. All URLs are intercepted;
// no server, demo application, HID access or external network is involved.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PUCK_CHROME
    ? { executablePath: process.env.PUCK_CHROME }
    : {}),
});
try {
  const page = await browser.newPage();
  const root = resolve("dist") + sep;
  const requests = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname);
    if (url.origin !== "https://puck.test") {
      await route.abort();
      throw Error("Unexpected external request.");
    }
    if (url.pathname === "/") {
      await route.fulfill({
        contentType: "text/html",
        headers: {
          "Content-Security-Policy":
            "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'",
        },
        body: "",
      });
      return;
    }
    const path = resolve("dist", url.pathname.replace(/^\/dist\//, ""));
    if (
      !path.startsWith(root) ||
      !url.pathname.startsWith("/dist/") ||
      !path.endsWith(".js")
    ) {
      await route.abort();
      return;
    }
    await route.fulfill({
      contentType: "application/javascript",
      body: readFileSync(path),
    });
  });
  await page.goto("https://puck.test/");
  const result = await page.evaluate(async () => {
    const start = performance.now();
    const api = await import("/dist/index.js");
    const loadMs = performance.now() - start;
    const adapter = await import("/dist/webhid.js");
    const graph = await import("/dist/graph.js");
    const pan = api.control.continuous("slide", {
        as: "velocity",
        deadzone: 0,
        responseMs: 0,
      }),
      p = api.createPuck({ controls: { pan }, clock: () => 0 });
    p.feed(api.neutralInput, 0);
    p.frame(0);
    p.feed({ ...api.neutralInput, x: 0.5 }, 10);
    const delta = p.frame(20).integrate(pan);
    p.interrupt("pause", 20);
    const stopped = p.read(pan);
    p.dispose(20);
    if (
      delta[0] !== 0.005 ||
      stopped[0] !== 0 ||
      typeof adapter.connectPuck !== "function" ||
      typeof graph.createControlGraph !== "function"
    )
      throw Error("Browser ESM smoke failed.");
    return { loadMs, delta, stopped };
  });
  console.log(
    JSON.stringify({
      browser: await browser.version(),
      ...result,
      moduleRequests: requests.length,
      wasmFetches: requests.filter((p) => p.endsWith(".wasm")).length,
    }),
  );
} finally {
  await browser.close();
}
