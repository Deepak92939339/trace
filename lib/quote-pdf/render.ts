import { chromium, type Browser } from "playwright-core";

/**
 * HTML in, PDF bytes out. Everything else (templates, data, storage) is independent of how the
 * bytes are produced, so a different engine only has to replace this module.
 */
const RENDER_TIMEOUT_MS = 45_000;

type EngineLaunch = (() => Promise<Browser>) & { engine: string };

function onServerless() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/** Local and CI: the Chromium that Playwright installed (`npx playwright install chromium`). */
const launchLocal: EngineLaunch = Object.assign(
  () => chromium.launch({ headless: true }),
  { engine: "playwright-chromium" },
);

/**
 * NOT SPIKED. Serverless path (Vercel / Lambda): playwright-core drives the compressed Chromium
 * from @sparticuz/chromium. It is written to the packages' documented API but has not been run
 * on Vercel. The two packages are pinned to the same Chromium major: playwright-core 1.61.x
 * targets Chromium 149 (node_modules/playwright-core/browsers.json) and @sparticuz/chromium is
 * pinned to 149.0.0. Keep them in step when either is upgraded. Open items for the deploy spike
 * (C2): bundle size against the function limit, cold start, memory and maxDuration. Until that
 * spike passes, treat this branch as unverified.
 */
const launchServerless: EngineLaunch = Object.assign(
  async () => {
    const { default: packaged } = await import("@sparticuz/chromium");
    return chromium.launch({
      executablePath: await packaged.executablePath(),
      args: packaged.args,
      headless: true,
    });
  },
  { engine: "sparticuz-chromium (unspiked)" },
);

export async function renderPdf(html: string): Promise<Buffer> {
  const launch = onServerless() ? launchServerless : launchLocal;
  const browser = await launch();
  try {
    const work = (async () => {
      const context = await browser.newContext({ acceptDownloads: false });
      // The document is self-contained (fonts are data: URIs). Refuse everything else so a
      // render can never fetch from, or leak to, the network.
      await context.route("**/*", (route) =>
        route.request().url().startsWith("data:")
          ? route.continue()
          : route.abort(),
      );
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await page.emulateMedia({ media: "print" });
      await page.setContent(html, { waitUntil: "load" });
      // The print document is display:none on screen, so the browser has not needed any font
      // yet. Load every embedded face explicitly; otherwise the first print layout would
      // snapshot text that is still waiting for its font.
      await page.evaluate(async () => {
        await Promise.all([...document.fonts].map((face) => face.load()));
        await document.fonts.ready;
      });
      const bytes = await page.pdf({
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: false,
        tagged: true,
        outline: false,
      });
      return Buffer.from(bytes);
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("PDF render timed out.")),
        RENDER_TIMEOUT_MS,
      );
    });
    try {
      return await Promise.race([work, deadline]);
    } finally {
      clearTimeout(timer);
      work.catch(() => undefined);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}
