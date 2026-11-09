/**
 * Prueba funcional de la interfaz con Chrome real.
 *   node scripts/e2e.mjs
 */
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:5180';
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});

const problems = [];
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '  ok  ' : 'FAIL  '}${name}${ok ? '' : `  ${extra}`}`);
  if (!ok) problems.push(name);
};

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

async function ready() {
  await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 40000 });
  await page.waitForTimeout(500);
}

const gameState = () => page.evaluate(() => {
  const { state, board } = window.__mariposa;
  return {
    held: state.held && { id: state.held.pieceId, origin: state.held.origin },
    ghost: state.ghost,
    layer: state.layer,
    won: state.won,
    moves: state.moves,
    history: state.history.length,
    count: board.count,
    layers: board.layerCounts(),
    isolate: state.isolate,
  };
});

const piecePoint = (pieceId) => page.evaluate((id) => {
  const { board, world } = window.__mariposa;
  const placement = board.placements.get(id);
  if (!placement) return null;
  const xs = placement.cells.map((c) => c[0]);
  const ys = placement.cells.map((c) => c[1]);
  const zs = placement.cells.map((c) => c[2]);
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length + 0.5;
  const cy = ys.reduce((a, b) => a + b, 0) / ys.length + 0.5;
  const cz = zs.reduce((a, b) => a + b, 0) / zs.length + 0.5;
  const v = world.camera.position.clone().set(cx - 2.5, cy, cz - 2.5);
  v.project(world.camera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
}, pieceId);

await page.goto(base, { waitUntil: 'load' });
await ready();
check('carga sin errores', problems.length === 0, problems.join(' | '));
check('11 piezas en la bandeja', (await page.locator('.tray-slot').count()) === 11);

const canvasBox = await page.locator('#stage').boundingBox();
const center = { x: canvasBox.x + canvasBox.width * 0.49, y: canvasBox.y + canvasBox.height * 0.49 };

// Elegir y colocar
await page.locator('.tray-slot').nth(1).click();
await page.mouse.move(center.x, center.y);
await page.waitForTimeout(250);
let s = await gameState();
check('pieza en mano', s.held?.id === 1, JSON.stringify(s.held));
check('fantasma válido', s.ghost?.valid === true, JSON.stringify(s.ghost));
await page.mouse.click(center.x, center.y);
await page.waitForTimeout(500);
s = await gameState();
check('pieza colocada', s.count === 1 && s.held === null, JSON.stringify(s));
check('contador 1/11', (await page.locator('#stat-pieces').textContent()).trim() === '1/11');
check('capa 1 con 5 celdas', s.layers[0] === 5, JSON.stringify(s.layers));

// Recoger y cancelar con Escape
const point = await piecePoint(1);
check('se proyecta la pieza', point !== null);
await page.mouse.click(point.x, point.y);
await page.waitForTimeout(350);
s = await gameState();
check('pieza recogida', s.count === 0 && s.held?.origin === 'board', JSON.stringify(s));
await page.keyboard.press('Escape');
await page.waitForTimeout(350);
s = await gameState();
check('Escape devuelve la pieza', s.count === 1 && s.held === null, JSON.stringify(s));

// Deshacer
await page.locator('#btn-undo').click();
await page.waitForTimeout(350);
s = await gameState();
check('deshacer vacía el cubo', s.count === 0, JSON.stringify(s));
check('deshacer desactiva el botón', await page.locator('#btn-undo').isDisabled());

// Capas y aislamiento
await page.locator('.layer[data-layer="3"]').click();
s = await gameState();
check('cambia a la capa 4', s.layer === 3, String(s.layer));
await page.locator('#btn-isolate').click();
s = await gameState();
check('aísla la capa', s.isolate === true);
await page.locator('#btn-isolate').click();
await page.locator('.layer[data-layer="0"]').click();

// Rotación con teclado
await page.locator('.tray-slot').nth(2).click();
await page.mouse.move(center.x, center.y);
await page.waitForTimeout(200);
const before = await page.evaluate(() => window.__mariposa.state.held.orient.size.join('x'));
await page.keyboard.press('x');
await page.waitForTimeout(200);
const after = await page.evaluate(() => window.__mariposa.state.held.orient.size.join('x'));
check('girar cambia la orientación', before !== after, `${before} -> ${after}`);
await page.keyboard.press('Escape');

// Pistas hasta ganar
for (let i = 0; i < 11; i += 1) {
  await page.locator('#btn-hint').click();
  await page.waitForTimeout(180);
}
await page.waitForSelector('#win:not([hidden])', { timeout: 8000 });
s = await gameState();
check('once piezas colocadas', s.count === 11, JSON.stringify(s));
check('estado de victoria', s.won === true);
check('contador 11/11', (await page.locator('#stat-pieces').textContent()).trim() === '11/11');
check('capas densas', s.layers.join(',') === '19,25,22,21,23', JSON.stringify(s.layers));

// Cerrar la victoria y ver el cubo lleno (captura)
await page.locator('[data-win="close"]').click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/08-cubo-lleno.png' });

// Reiniciar desde el aviso de victoria
await page.locator('#btn-reset').click();
await page.waitForSelector('#confirm[open]');
await page.locator('[data-confirm="yes"]').click();
await page.waitForTimeout(700);
s = await gameState();
check('reiniciar deja el cubo vacío', s.count === 0 && s.won === false, JSON.stringify(s));

// Ayuda
await page.locator('#btn-help').click();
await page.waitForSelector('#help[open]');
await page.locator('#btn-help-close').click();
check('ayuda se abre y cierra', true);

// Móvil: tocar pieza y tocar el cubo
const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const mobile = await mobileContext.newPage();
mobile.on('pageerror', (e) => problems.push(`mobile pageerror: ${e.message}`));
await mobile.goto(base, { waitUntil: 'load' });
await mobile.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 40000 });
await mobile.waitForTimeout(500);
await mobile.locator('.tray-slot').nth(0).click();
const mbox = await mobile.locator('#stage').boundingBox();
await mobile.touchscreen.tap(mbox.x + mbox.width * 0.5, mbox.y + mbox.height * 0.42);
await mobile.waitForTimeout(700);
const mstate = await mobile.evaluate(() => ({
  count: window.__mariposa.board.count,
  placed: window.__mariposa.state.held,
}));
check('móvil coloca con un toque', mstate.count === 1 && mstate.placed === null, JSON.stringify(mstate));
await mobile.screenshot({ path: 'shots/09-movil-juego.png' });
await mobileContext.close();

await browser.close();

if (problems.length) {
  console.error(`\n${problems.length} problema(s):`);
  for (const p of problems) console.error(`- ${p}`);
  process.exitCode = 1;
} else {
  console.log('\nE2E OK');
}
