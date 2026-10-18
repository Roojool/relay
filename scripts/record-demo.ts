/**
 * Relay — Playwright demo video recorder (Phase 06).
 *
 * Starts the Next.js dev server (FalkorDB at 127.0.0.1:16380 via .env.local),
 * walks the S1 hero scenario end to end, and records a WebM demo to
 * demos/relay-demo.webm.
 *
 * All data shown is fictional.
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PROJECT_ROOT = process.cwd();
const DEMO_DIR = path.join(PROJECT_ROOT, 'demos');
const VIDEO_OUT = path.join(DEMO_DIR, 'relay-demo.webm');
// Pre-installed system Chromium (ms-playwright). playwright-core has no bundled browser.
const CHROME_EXE =
  'C:\\Users\\roojo\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const BASE_URL = 'http://127.0.0.1:3000';

let devServer: ReturnType<typeof spawn> | null = null;

async function waitForHealth(retries = 100, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        const data = await res.json();
        if (data.falkordb === true) return data;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('Next.js dev server did not become healthy / FalkorDB unreachable');
}

async function main() {
  fs.mkdirSync(DEMO_DIR, { recursive: true });

  // --- Start Next.js dev server ---
  const nextBin = path.join(PROJECT_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  devServer = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, FALKORDB_URL: 'redis://127.0.0.1:16380' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  devServer.stdout?.on('data', (d) => process.stdout.write(`[next] ${d}`));
  devServer.stderr?.on('data', (d) => process.stderr.write(`[next-err] ${d}`));

  try {
    await waitForHealth();

    // --- Record the walkthrough ---
    const browser = await chromium.launch({ executablePath: CHROME_EXE, headless: true });
    const context = await browser.newContext({
      recordVideo: { dir: DEMO_DIR, size: { width: 1280, height: 800 } },
    });
    const page = await context.newPage();

    // 1. Load the app -> S1 hero workspace auto-created (cookie-bound, anonymous)
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="hero-card"]', { state: 'visible', timeout: 20000 });
    await page.waitForTimeout(900);

    // 2. Run the deterministic plan check (reveals hos_insufficient finding),
    //    then the hero diagnosis surfaces the blocked leg-l31 (Okafor's HOS short).
    await page.locator('[data-testid="hero-check-plan"]').click();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="hero-card"]');
      return el && (el.textContent || '').includes('critical finding');
    }, { timeout: 30000 });
    const summary = (await page.locator('[data-testid="hero-card"]').textContent()) || '';
    if (!summary.includes('critical finding')) {
      throw new Error(`Hero summary did not surface the S1 bottleneck: ${summary.slice(0, 200)}`);
    }

    // 4. Conflicts -> evidence view
    await page.locator('[data-testid="nav-conflicts"]').click();
    await page.waitForSelector('[data-testid="conflict-view"]', { state: 'visible', timeout: 15000 });
    await page.waitForTimeout(1000);

    // 5. Repairs -> review proposals (valid split-leg to Ravensgate; Petrov rejected with evidence)
    await page.locator('[data-testid="nav-repairs"]').click();
    await page.waitForSelector('[data-testid="options-view"]', { state: 'visible', timeout: 15000 });
    await page.waitForTimeout(1000);

    const approveButtons = page.locator('[data-testid^="approve-"]');
    if ((await approveButtons.count()) > 0) {
      await approveButtons.first().click();
      await page.waitForTimeout(900); // approval flips view to receipts
    }

    // 6. Receipts -> idempotent decision recorded
    await page.locator('[data-testid="nav-receipts"]').click();
    await page.waitForSelector('[data-testid="receipts-view"]', { state: 'visible', timeout: 15000 });
    await page.waitForTimeout(800);

    // 7. Memory -> agent Q&A about leg-l31 (deterministic replay, truthful mode badge)
    await page.locator('[data-testid="nav-memory"]').click();
    await page.waitForSelector('[data-testid="memory-view"]', { state: 'visible', timeout: 15000 });
    const messageInput = page.locator('[data-testid="memory-view"] input[type="text"]');
    await messageInput.fill('Tell me about leg-l31');
    await page.locator('[data-testid="memory-view"] button.btn-editorial-primary').click();
    await page.waitForTimeout(1200);

    await page.waitForTimeout(800);
    await context.close();
    await browser.close();
  } finally {
    if (devServer && !devServer.killed) devServer.kill();
  }

  // --- Rename the produced video to the canonical name ---
  const files = fs.readdirSync(DEMO_DIR).filter((f) => f.endsWith('.webm'));
  if (files.length === 0) throw new Error('no video was recorded by Playwright');
  const produced = path.join(DEMO_DIR, files[0]);
  if (path.basename(produced) !== 'relay-demo.webm') {
    fs.renameSync(produced, VIDEO_OUT);
  }
  console.log(`Demo video written: ${VIDEO_OUT}`);
}

main().catch((err) => {
  console.error(err);
  if (devServer && !devServer.killed) devServer.kill();
  process.exit(1);
});
