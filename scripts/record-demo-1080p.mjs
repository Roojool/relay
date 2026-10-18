/**
 * Relay — demo video re-record (1080p, paced, with /blog stop).
 *
 * UNTRACKED helper for the Phase-06 re-recording dispatch. Mirrors the
 * committed scripts/record-demo.ts exactly (same server launch, same env,
 * same pre-installed chromium, same testid-driven walkthrough) with three
 * additions required by the re-record spec:
 *   1. 1920x1080 canvas (the committed script recorded 1280x800)
 *   2. pacing dwells so the final video lands in the 60-120s window
 *      (the committed script's run finished in ~8-32s of content)
 *   3. a final stop on the /blog page (the committed script ended at memory)
 *
 * The committed scripts/record-demo.ts is NOT modified by this file.
 * All data shown is fictional.
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as net from 'node:net';

const PROJECT_ROOT = process.cwd();
const WORKSPACE_ROOT = path.join(PROJECT_ROOT, '..', '..');
const DEMO_DIR = path.join(WORKSPACE_ROOT, 'demos');
const LOCAL_DEMO_DIR = path.join(PROJECT_ROOT, 'demos');
const VIDEO_OUT_WORKSPACE = path.join(DEMO_DIR, 'relay-demo.webm');
const VIDEO_OUT_LOCAL = path.join(LOCAL_DEMO_DIR, 'relay-demo.webm');
// Pre-installed system Chromium (ms-playwright). playwright-core has no bundled browser.
const CHROME_EXE =
  'C:\\Users\\roojo\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';

let devServer = null;
const T0 = Date.now();
const log = (msg) => console.log(`[record ${((Date.now() - T0) / 1000).toFixed(1)}s] ${msg}`);

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port, timeout: 1000 });
    s.on('connect', () => { s.destroy(); resolve(false); });
    s.on('error', () => { s.destroy(); resolve(true); });
    s.on('timeout', () => { s.destroy(); resolve(true); });
  });
}

function waitForHealth(base, retries = 100, delayMs = 1000) {
  const wait = (i) => new Promise((r) => setTimeout(r, delayMs));
  return (async () => {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(`${base}/api/health`);
        if (res.ok) {
          const data = await res.json();
          if (data.falkordb === true) return data;
        }
      } catch {
        // not up yet
      }
      await wait(i);
    }
    throw new Error('Next.js dev server did not become healthy / FalkorDB unreachable');
  })();
}

const DWELL = {
  hero: 8000,
  analysis: 7000,
  conflicts: 9000,
  repairs: 9000,
  approve: 5000,
  receipts: 7000,
  memory: 8000,
  blog: 12000,
  final: 4000,
};

async function main() {
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  fs.mkdirSync(LOCAL_DEMO_DIR, { recursive: true });

  // --- Pick a free local port (spec: "a local server on a free port") ---
  let port = 3000;
  for (const candidate of [3000, 3100, 3200]) {
    if (await portFree(candidate)) { port = candidate; break; }
  }
  const BASE_URL = `http://127.0.0.1:${port}`;
  log(`using ${BASE_URL}`);

  // Pre-existing .webm files (tracked originals must be left untouched):
  const preExistingWorkspace = new Set(fs.readdirSync(DEMO_DIR).filter((f) => f.endsWith('.webm')));
  const preExistingLocal = new Set(fs.readdirSync(LOCAL_DEMO_DIR).filter((f) => f.endsWith('.webm')));

  // --- Start Next.js dev server (identical invocation to the committed recorder) ---
  const nextBin = path.join(PROJECT_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  // On the default port (3000) the invocation stays identical to the committed
  // recorder; -p is only added when we had to fall back to another free port.
  const portArgs = port === 3000 ? [] : ['-p', String(port)];
  devServer = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', ...portArgs], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, FALKORDB_URL: 'redis://127.0.0.1:16380' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  devServer.stdout.on('data', (d) => process.stdout.write(`[next] ${d}`));
  devServer.stderr.on('data', (d) => process.stderr.write(`[next-err] ${d}`));

  let context = null;
  let browser = null;
  try {
    const health = await waitForHealth(BASE_URL);
    log(`healthy: ${JSON.stringify(health)}`);

    // --- Record the walkthrough (1080p) ---
    browser = await chromium.launch({ executablePath: CHROME_EXE, headless: true });
    context = await browser.newContext({
      recordVideo: { dir: LOCAL_DEMO_DIR, size: { width: 1920, height: 1080 } },
    });
    const page = await context.newPage();

    // 1. Load the app -> S1 hero workspace auto-created (cookie-bound, anonymous)
    //    BusinessSetup shows if no workspace exists, otherwise HeroBottleneckCard + DashboardView
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="hero-card"], [data-testid="business-setup"], [data-testid="dashboard-view"]', { state: 'visible', timeout: 20000 });
    log('1. hero workspace / setup visible');
    await page.waitForTimeout(DWELL.hero);

    // 2. Run the deterministic plan check (reveals hos_insufficient finding),
    //    then the hero diagnosis surfaces the blocked leg-l31 (Okafor's HOS short).
    await page.locator('[data-testid="hero-check-plan"], [data-testid="dashboard-check-plan"]').first().click();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="hero-card"]');
      return el && (el.textContent || '').includes('critical finding');
    }, { timeout: 30000 });
    const summary = (await page.locator('[data-testid="hero-card"]').textContent()) || '';
    if (!summary.includes('critical finding')) {
      throw new Error(`Hero summary did not surface the S1 bottleneck: ${summary.slice(0, 200)}`);
    }
    log('2. analysis complete: S1 diagnosis visible');
    await page.waitForTimeout(DWELL.analysis);

    // 3. Conflicts -> evidence view
    await page.locator('[data-testid="nav-conflicts"]').click();
    await page.waitForSelector('[data-testid="conflict-view"]', { state: 'visible', timeout: 15000 });
    log('3. conflict evidence view visible');
    await page.waitForTimeout(DWELL.conflicts);

    // 4. Repairs -> review proposals (valid split-leg to Ravensgate; Petrov rejected with evidence)
    await page.locator('[data-testid="nav-repairs"]').click();
    await page.waitForSelector('[data-testid="options-view"]', { state: 'visible', timeout: 15000 });
    log('4. repair comparison view visible');
    await page.waitForTimeout(DWELL.repairs);

    // 5. Approve the valid repair proposal (optional, as in the committed script)
    const approveButtons = page.locator('[data-testid^="approve-"]');
    if ((await approveButtons.count()) > 0) {
      await approveButtons.first().click();
      log('5. approved first valid proposal');
      await page.waitForTimeout(DWELL.approve);
    } else {
      log('5. no approvable proposal present (skipped, as per committed script)');
      await page.waitForTimeout(2000);
    }

    // 6. Receipts -> idempotent decision recorded
    await page.locator('[data-testid="nav-receipts"]').click();
    await page.waitForSelector('[data-testid="receipts-view"]', { state: 'visible', timeout: 15000 });
    log('6. receipts view visible');
    await page.waitForTimeout(DWELL.receipts);

    // 7. Memory -> agent Q&A about leg-l31 (deterministic replay, truthful mode badge)
    await page.locator('[data-testid="nav-memory"]').click();
    await page.waitForSelector('[data-testid="memory-view"]', { state: 'visible', timeout: 15000 });
    const memoryView = page.locator('[data-testid="memory-view"]');
    const beforeLen = ((await memoryView.textContent()) || '').length;
    const messageInput = page.locator('[data-testid="memory-view"] input[type="text"]');
    await messageInput.fill('Tell me about leg-l31');
    await page.locator('[data-testid="memory-view"] button.btn-editorial-primary').click();
    log('7. memory question submitted, waiting for reply...');
    await page.waitForFunction((prev) => {
      const el = document.querySelector('[data-testid="memory-view"]');
      return el && (el.textContent || '').length > prev + 200;
    }, beforeLen, { timeout: 20000 }).catch(() => log('   (reply-length wait timed out; continuing)'));
    await page.waitForTimeout(DWELL.memory);

    // 8. Blog -> engineering notes page (final stop)
    await page.goto(`${BASE_URL}/blog`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1', { state: 'visible', timeout: 15000 });
    log('8. blog page visible');
    await page.waitForTimeout(DWELL.blog);

    await page.waitForTimeout(DWELL.final);
  } finally {
    if (context) { try { await context.close(); } catch { /* video already finalized */ } }
    if (browser) { try { await browser.close(); } catch { /* already closed */ } }
    if (devServer && !devServer.killed) devServer.kill();
  }

  // --- Select the freshly produced video (never touch pre-existing/tracked files) ---
  const afterLocal = fs.readdirSync(LOCAL_DEMO_DIR).filter((f) => f.endsWith('.webm'));
  const produced = afterLocal.find((f) => !preExistingLocal.has(f));
  if (!produced) throw new Error('no new video was recorded by Playwright');
  const producedPath = path.join(LOCAL_DEMO_DIR, produced);

  // Copy to both locations
  fs.copyFileSync(producedPath, VIDEO_OUT_LOCAL);
  fs.copyFileSync(producedPath, VIDEO_OUT_WORKSPACE);

  // Clean up any page@*.webm raw fragments in both dirs
  for (const dir of [LOCAL_DEMO_DIR, DEMO_DIR]) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.startsWith('page@') && f.endsWith('.webm')) {
        fs.unlinkSync(path.join(dir, f));
        log(`cleaned fragment: ${f}`);
      }
    }
  }

  const statsLocal = fs.statSync(VIDEO_OUT_LOCAL);
  const statsWorkspace = fs.statSync(VIDEO_OUT_WORKSPACE);
  log(`DONE in ${((Date.now() - T0) / 1000).toFixed(1)}s`);
  log(`  local:  ${VIDEO_OUT_LOCAL} (${statsLocal.size} bytes)`);
  log(`  workspace: ${VIDEO_OUT_WORKSPACE} (${statsWorkspace.size} bytes)`);
}

main().catch((err) => {
  console.error(err);
  if (devServer && !devServer.killed) devServer.kill();
  process.exit(1);
});