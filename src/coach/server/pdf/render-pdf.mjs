/**
 * Render trusted, already-escaped document HTML to a PDF buffer.
 * Never log document contents.
 *
 * Vercel / serverless: @sparticuz/chromium + puppeteer-core (headless shell).
 * Local: full puppeteer (bundled Chrome) when VERCEL is unset.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveChromiumExecutable } from './chromium-launch.mjs';

/**
 * @typedef {'chromium_import'|'puppeteer_import'|'executable_path'|'browser_launch'|'page_creation'|'set_content'|'pdf_buffer'|'browser_close'|'ok'} PdfRenderStage
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
  let stage = 'chromium_import';
  let browser;

  const isServerless = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

  try {
    let puppeteer;
    /** @type {import('puppeteer-core').LaunchOptions} */
    let launchOptions;

    if (isServerless) {
      stage = 'chromium_import';
      const [{ default: chromium }, puppeteerCore] = await Promise.all([
        import('@sparticuz/chromium'),
        import('puppeteer-core'),
      ]);
      stage = 'puppeteer_import';
      puppeteer = puppeteerCore.default || puppeteerCore;

      // Disable WebGL / swiftshader extract — PDF print does not need GPU.
      try {
        chromium.setGraphicsMode = false;
      } catch {
        // ignore older shapes
      }

      stage = 'executable_path';
      const resolved = await resolveChromiumExecutable(chromium);
      if (!resolved.executablePath || !fs.existsSync(resolved.executablePath)) {
        const err = new Error('chromium_executable_missing');
        err.code = 'chromium_executable_missing';
        throw err;
      }
      log({
        requestId,
        event: 'chromium_resolved',
        stage,
        source: resolved.source,
        bundledBinPresent: resolved.bundledBinPresent,
        remoteHost: resolved.remoteHost,
        exeBase: path.basename(resolved.executablePath),
        node: process.versions.node,
        arch: process.arch,
        platform: process.platform,
        vercel: Boolean(process.env.VERCEL),
        region: process.env.VERCEL_REGION || null,
      });

      const execDir = path.dirname(resolved.executablePath);
      process.env.LD_LIBRARY_PATH = [execDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter);

      stage = 'browser_launch';
      const args = typeof puppeteer.defaultArgs === 'function'
        ? await puppeteer.defaultArgs({
          args: chromium.args,
          headless: 'shell',
        })
        : chromium.args;
      launchOptions = {
        args,
        defaultViewport: {
          width: 794,
          height: 1123,
          deviceScaleFactor: 1,
        },
        executablePath: resolved.executablePath,
        headless: 'shell',
      };
    } else {
      stage = 'puppeteer_import';
      const local = await import('puppeteer');
      puppeteer = local.default || local;
      stage = 'browser_launch';
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
    stage = 'page_creation';
    const page = await browser.newPage();
    stage = 'set_content';
    // Self-contained HTML (data-URI logos): networkidle0 can hang on serverless.
    await page.setContent(String(html), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    stage = 'pdf_buffer';
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout: 30_000,
      ...(opts.pdfOptions && typeof opts.pdfOptions === 'object' ? opts.pdfOptions : {}),
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
      stage: 'response_send',
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
      node: process.versions.node,
      region: process.env.VERCEL_REGION || null,
    });
    const wrapped = new Error(`pdf_render_failed:${stage}`);
    wrapped.code = `pdf_render_failed:${stage}`;
    wrapped.stage = stage;
    wrapped.cause = error;
    throw wrapped;
  } finally {
    if (browser) {
      try {
        stage = 'browser_close';
        await browser.close();
      } catch (closeError) {
        log({
          requestId,
          event: 'pdf_browser_close_failed',
          stage: 'browser_close',
          message: String(closeError?.message || closeError).slice(0, 160),
        });
      }
    }
  }
}
