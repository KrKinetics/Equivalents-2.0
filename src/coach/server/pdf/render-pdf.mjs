/**
 * Render trusted, already-escaped document HTML to a PDF buffer.
 * Never log document contents.
 *
 * Vercel / serverless: @sparticuz/chromium + puppeteer-core (headless shell).
 * Local: full puppeteer (bundled Chrome) when VERCEL is unset.
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';

/**
 * @typedef {'import_chromium'|'import_puppeteer'|'executable_path'|'launch'|'new_page'|'set_content'|'pdf'|'close'|'ok'} PdfRenderStage
 */

/**
 * @param {string} html
 * @param {{ requestId?: string, log?: (entry: object) => void }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function renderHtmlToPdfBuffer(html, opts = {}) {
  const requestId = opts.requestId || randomUUID();
  const log = typeof opts.log === 'function' ? opts.log : () => {};
  /** @type {PdfRenderStage} */
  let stage = 'import_chromium';
  let browser;

  const isServerless = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
  // Must be set before importing @sparticuz/chromium so AL2023 shared libs resolve on Vercel.
  if (isServerless && !process.env.AWS_LAMBDA_JS_RUNTIME) {
    process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs22.x';
  }

  try {
    let puppeteer;
    /** @type {import('puppeteer-core').LaunchOptions} */
    let launchOptions;

    if (isServerless) {
      stage = 'import_chromium';
      const [{ default: chromium }, puppeteerCore] = await Promise.all([
        import('@sparticuz/chromium'),
        import('puppeteer-core'),
      ]);
      stage = 'import_puppeteer';
      puppeteer = puppeteerCore.default || puppeteerCore;

      if (typeof chromium.setGraphicsMode === 'function') {
        chromium.setGraphicsMode(false);
      } else if ('graphicsMode' in chromium) {
        chromium.graphicsMode = false;
      }

      stage = 'executable_path';
      const executablePath = await chromium.executablePath();
      if (!executablePath) {
        const err = new Error('chromium_executable_missing');
        err.code = 'chromium_executable_missing';
        throw err;
      }
      const execDir = path.dirname(executablePath);
      process.env.LD_LIBRARY_PATH = [execDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter);

      stage = 'launch';
      const args = await puppeteer.defaultArgs({
        args: chromium.args,
        headless: 'shell',
      });
      launchOptions = {
        args,
        defaultViewport: {
          width: 794,
          height: 1123,
          deviceScaleFactor: 1,
        },
        executablePath,
        headless: 'shell',
      };
    } else {
      stage = 'import_puppeteer';
      const local = await import('puppeteer');
      puppeteer = local.default || local;
      stage = 'launch';
      launchOptions = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: {
          width: 794,
          height: 1123,
          deviceScaleFactor: 1,
        },
      };
    }

    browser = await puppeteer.launch(launchOptions);
    stage = 'new_page';
    const page = await browser.newPage();
    stage = 'set_content';
    // Self-contained HTML (data-URI logos): networkidle0 can hang on serverless.
    await page.setContent(String(html), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    stage = 'pdf';
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout: 30_000,
    });
    const buffer = Buffer.from(pdf);
    if (!buffer.length || buffer.subarray(0, 4).toString() !== '%PDF') {
      const err = new Error('pdf_buffer_invalid');
      err.code = 'pdf_buffer_invalid';
      throw err;
    }
    stage = 'ok';
    log({
      requestId,
      event: 'pdf_render_ok',
      stage,
      bytes: buffer.length,
      serverless: isServerless,
    });
    return buffer;
  } catch (error) {
    const code = error?.code || error?.name || 'pdf_render_failed';
    log({
      requestId,
      event: 'pdf_render_failed',
      stage,
      code: String(code).slice(0, 80),
      message: String(error?.message || error).slice(0, 240),
      serverless: isServerless,
    });
    const wrapped = new Error(`pdf_render_failed:${stage}`);
    wrapped.code = `pdf_render_failed:${stage}`;
    wrapped.cause = error;
    throw wrapped;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        log({
          requestId,
          event: 'pdf_browser_close_failed',
          stage: 'close',
          message: String(closeError?.message || closeError).slice(0, 160),
        });
      }
    }
  }
}
