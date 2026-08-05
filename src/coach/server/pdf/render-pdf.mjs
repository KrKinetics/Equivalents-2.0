/**
 * Render trusted, already-escaped document HTML. Never log document contents.
 */
export async function renderHtmlToPdfBuffer(html) {
  let browser;
  try {
    let puppeteer;
    let launchOptions = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
    if (process.env.VERCEL) {
      try {
        const [{ default: chromium }, puppeteerCore] = await Promise.all([
          import('@sparticuz/chromium'),
          import('puppeteer-core'),
        ]);
        puppeteer = puppeteerCore.default || puppeteerCore;
        launchOptions = {
          headless: chromium.headless,
          executablePath: await chromium.executablePath(),
          args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
        };
      } catch (vercelError) {
        try {
          const local = await import('puppeteer');
          puppeteer = local.default || local;
        } catch {
          throw new Error('PDF renderer is unavailable: install @sparticuz/chromium and puppeteer-core for Vercel.');
        }
      }
    } else {
      const local = await import('puppeteer');
      puppeteer = local.default || local;
    }
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setContent(String(html), { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: 0 });
    return Buffer.from(pdf);
  } finally {
    if (browser) await browser.close();
  }
}
