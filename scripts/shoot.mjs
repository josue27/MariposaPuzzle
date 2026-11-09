/**
 * Capturas de verificación con Chrome + Playwright.
 * Requiere poder lanzar el navegador.
 *
 *   node scripts/shoot.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:5180';
const executablePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = path.resolve('shots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});

const problems = [];

async function openPage(options, url = base) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text();
      if (!text.includes('favicon')) problems.push(`console: ${text}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 40000 });
  await page.waitForTimeout(700);
  return { context, page };
}

const desktop = await openPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await desktop.page.screenshot({ path: path.join(outDir, '01-inicio.png') });

// Pieza en la mano + fantasma sobre el cubo
await desktop.page.locator('.tray-slot').nth(0).click();
const box = await desktop.page.locator('#stage').boundingBox();
const target = { x: box.x + box.width * 0.49, y: box.y + box.height * 0.47 };
await desktop.page.mouse.move(target.x, target.y);
await desktop.page.waitForTimeout(500);
await desktop.page.screenshot({ path: path.join(outDir, '02-fantasma.png') });

// Colocar
await desktop.page.mouse.click(target.x, target.y);
await desktop.page.waitForTimeout(900);
await desktop.page.screenshot({ path: path.join(outDir, '03-colocada.png') });

// Vaciar para que la receta de pistas pueda completar el cubo desde cero.
await desktop.page.locator('#btn-undo').click();
await desktop.page.waitForTimeout(400);

// Rellenar con pistas hasta ganar
for (let i = 0; i < 11; i += 1) {
  const hint = desktop.page.locator('#btn-hint');
  if (await hint.isDisabled()) break;
  await hint.click();
  await desktop.page.waitForTimeout(240);
}
await desktop.page.waitForSelector('#win:not([hidden])', { timeout: 8000 });
await desktop.page.waitForTimeout(900);
await desktop.page.screenshot({ path: path.join(outDir, '04-victoria.png') });
const placed = await desktop.page.locator('#stat-pieces').textContent();
if (placed?.trim() !== '11/11') problems.push(`Contador inesperado: ${placed}`);

await desktop.context.close();

const mobile = await openPage(
  { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  `${base}/?demo=parcial`,
);
await mobile.page.screenshot({ path: path.join(outDir, '05-movil.png') });
await mobile.context.close();

const winDemo = await openPage(
  { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  `${base}/?demo=win`,
);
await winDemo.page.waitForSelector('#win:not([hidden])', { timeout: 8000 }).catch(() => {});
await winDemo.page.waitForTimeout(900);
await winDemo.page.screenshot({ path: path.join(outDir, '06-victoria-demo.png') });
await winDemo.context.close();

const ghostDemo = await openPage(
  { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  `${base}/?demo=ghost`,
);
await ghostDemo.page.screenshot({ path: path.join(outDir, '07-fantasma-demo.png') });
await ghostDemo.context.close();

await browser.close();

if (problems.length) {
  console.error('PROBLEMAS:\n' + problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Capturas OK en shots/');
}
