import { World } from './scene/world.js';
import { Board } from './game/board.js';
import { BASE_ORIENTATION, CUBE, PIECE_COUNT, rotateOrientation } from './game/shape.js';
import { findHint } from './game/solver.js';
import { Sfx } from './audio.js';
import { UI } from './ui.js';

const canvas = document.getElementById('stage');
const sfx = new Sfx();

const state = {
  held: null,
  layer: 0,
  ghost: null,
  moves: 0,
  startedAt: 0,
  elapsed: 0,
  running: false,
  won: false,
  isolate: false,
  history: [],
  lastPointer: null,
  best: null,
};

try {
  const saved = parseFloat(localStorage.getItem('mariposa.best'));
  if (Number.isFinite(saved) && saved > 0) state.best = saved;
} catch {
  state.best = null;
}

let world;
try {
  world = new World(canvas);
} catch (error) {
  console.error('No se pudo iniciar WebGL', error);
  const loading = document.getElementById('loading');
  if (loading) {
    loading.innerHTML = `
      <div class="loading-inner">
        <p style="letter-spacing:.2em">MARIPOSA</p>
        <span style="text-transform:none;letter-spacing:.02em;max-width:260px;display:block;line-height:1.6">
          No se pudo iniciar WebGL en este navegador. Prueba con Chrome, Edge o Safari actualizados.
        </span>
      </div>`;
  }
  throw error;
}

const board = new Board();

const ui = new UI({
  onPick: (pieceId) => pickPiece(pieceId),
  onLayer: (layer) => selectLayer(layer),
  onRotate: (axis) => rotate(axis),
  onHint: () => hint(),
  onUndo: () => undo(),
  onReset: (force) => resetGame(force),
  onIsolate: () => toggleIsolate(),
  onView: (view) => world.setView(view),
  onSound: () => {
    sfx.setEnabled(!sfx.enabled);
    ui.setSound(sfx.enabled);
  },
});

world.controls.addEventListener('start', () => {
  if (state.held) world.controls.enableRotate = false;
});

ui.setSound(sfx.enabled);
ui.setLayer(0);
ui.setIsolate(false);
ui.setPlaced([]);
ui.setLayerCounts(board.layerCounts());
world.setActiveLayer(0);
updateStats();
syncControls();

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

function elapsedSeconds() {
  return state.running ? (performance.now() - state.startedAt) / 1000 : state.elapsed;
}

function startTimer() {
  if (state.running) return;
  state.running = true;
  state.startedAt = performance.now() - state.elapsed * 1000;
  updateStats();
}

function updateStats() {
  ui.setStats({
    placed: board.count,
    total: PIECE_COUNT,
    seconds: elapsedSeconds(),
    moves: state.moves,
  });
}

function syncControls() {
  ui.setUndoEnabled(state.history.length > 0 && !state.won);
  ui.setHintEnabled(board.count < PIECE_COUNT && !state.won);
  if (state.held) world.controls.enableRotate = false;
  else world.controls.enableRotate = true;
}

function syncAll() {
  ui.setPlaced([...board.placements.keys()]);
  ui.setLayer(state.layer);
  ui.setLayerCounts(board.layerCounts());
  world.setActiveLayer(state.layer);
  if (state.isolate) world.setIsolation(state.layer);
  updateStats();
  syncControls();
}

/* ------------------------------------------------------------------ */
/* Elegir, girar y colocar                                             */
/* ------------------------------------------------------------------ */

function clampLayerForHeld() {
  if (!state.held) return;
  const maxBase = CUBE - state.held.orient.size[1];
  if (state.layer > maxBase) {
    state.layer = Math.max(0, maxBase);
    ui.setLayer(state.layer);
    world.setActiveLayer(state.layer);
    if (state.isolate) world.setIsolation(state.layer);
  }
}

function defaultPose(orient) {
  const [sx, sy, sz] = orient.size;
  const y = Math.min(state.layer, CUBE - sy);
  const x = Math.floor((CUBE - sx) / 2);
  const z = Math.floor((CUBE - sz) / 2);
  return { x, y, z, valid: board.canPlace(orient, x, y, z) };
}

function showGhostAt(orient, pose) {
  state.ghost = pose;
  world.showGhost(orient, pose, pose.valid);
}

function hold(pieceId, orient, origin, from = null) {
  state.held = { pieceId, orient, origin, from };
  if (origin === 'board' && from) state.layer = from.y;
  clampLayerForHeld();
  ui.setLayer(state.layer);
  ui.setHeld(pieceId);
  ui.setTipsForHeld(true, pieceId);
  canvas.style.cursor = 'grabbing';
  world.controls.enableRotate = false;
}

function pickPiece(pieceId) {
  if (state.won) return;
  sfx.unlock();
  world.stopAutoRotate();

  if (state.held?.pieceId === pieceId) {
    cancelHold();
    return;
  }
  if (state.held) cancelHold(true);

  if (board.placements.has(pieceId)) {
    pickUpPlaced(pieceId);
    return;
  }

  hold(pieceId, BASE_ORIENTATION, 'tray');
  showGhostAt(BASE_ORIENTATION, defaultPose(BASE_ORIENTATION));
  state.lastPointer = null;
}

function pickUpPlaced(pieceId) {
  if (state.won) return;
  if (state.held) cancelHold(true);
  if (!board.placements.has(pieceId)) return;
  const placement = board.remove(pieceId);
  if (!placement) return;
  world.removePiece(pieceId);

  state.history.push({
    type: 'pick',
    pieceId,
    orient: placement.orient,
    x: placement.x,
    y: placement.y,
    z: placement.z,
  });

  hold(pieceId, placement.orient, 'board', {
    x: placement.x,
    y: placement.y,
    z: placement.z,
  });
  state.ghost = {
    x: placement.x,
    y: placement.y,
    z: placement.z,
    valid: true,
  };
  world.showGhost(placement.orient, state.ghost, true);
  state.lastPointer = null;
  sfx.pick();
  syncAll();
}

function cancelHold() {
  if (!state.held) return;
  const held = state.held;
  if (held.origin === 'board' && held.from && !board.placements.has(held.pieceId)) {
    const restored = board.add(held.pieceId, held.orient, held.from.x, held.from.y, held.from.z);
    if (restored) {
      world.addPiece(held.pieceId, held.orient, held.from, { animate: false });
    }
    const last = state.history[state.history.length - 1];
    if (last?.type === 'pick' && last.pieceId === held.pieceId) state.history.pop();
  }
  state.held = null;
  state.ghost = null;
  state.lastPointer = null;
  world.hideGhost();
  ui.setHeld(null);
  ui.setTipsForHeld(false);
  canvas.style.cursor = 'grab';
  world.controls.enableRotate = true;
  syncAll();
}

function rotate(axis) {
  if (state.won) return;
  if (!state.held) {
    ui.toast('Primero elige una pieza para girarla.', 'warn');
    return;
  }
  state.held.orient = rotateOrientation(state.held.orient, axis);
  clampLayerForHeld();
  sfx.rotate();
  if (state.lastPointer) {
    updateGhost(state.lastPointer.x, state.lastPointer.y);
  } else {
    showGhostAt(state.held.orient, defaultPose(state.held.orient));
  }
}

function selectLayer(layer) {
  if (state.won) return;
  let next = Math.max(0, Math.min(CUBE - 1, layer));
  if (state.held) next = Math.min(next, CUBE - state.held.orient.size[1]);
  state.layer = Math.max(0, next);
  ui.setLayer(state.layer);
  world.setActiveLayer(state.layer);
  if (state.isolate) world.setIsolation(state.layer);
  sfx.tick();
  if (state.held) {
    if (state.lastPointer) updateGhost(state.lastPointer.x, state.lastPointer.y);
    else showGhostAt(state.held.orient, defaultPose(state.held.orient));
  }
}

function updateGhost(clientX, clientY) {
  if (!state.held) return;
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
  state.lastPointer = { x: clientX, y: clientY };
  const orient = state.held.orient;
  const [sx, sy, sz] = orient.size;
  const base = Math.min(state.layer, CUBE - sy);
  if (base !== state.layer) {
    state.layer = base;
    ui.setLayer(base);
    world.setActiveLayer(base);
    if (state.isolate) world.setIsolation(base);
  }
  const hit = world.layerPoint(clientX, clientY, 2.5);
  if (!hit) {
    state.ghost = null;
    world.hideGhost();
    return;
  }
  if (Math.abs(hit.x) > 4.35 || Math.abs(hit.z) > 4.35) {
    state.ghost = null;
    world.hideGhost();
    return;
  }
  const fx = hit.x + CUBE / 2 - sx / 2;
  const fz = hit.z + CUBE / 2 - sz / 2;
  const x = Math.max(0, Math.min(CUBE - sx, Math.round(fx)));
  const z = Math.max(0, Math.min(CUBE - sz, Math.round(fz)));
  const valid = board.canPlace(orient, x, base, z);
  showGhostAt(orient, { x, y: base, z, valid });
}

function placeHeld() {
  if (!state.held || state.won) return;
  const pose = state.ghost;
  if (!pose || !pose.valid) {
    sfx.invalid();
    ui.toast('Ahí no cabe: gira la pieza o cambia de capa.', 'warn');
    return;
  }
  const { pieceId, orient } = state.held;
  state.history.push({ type: 'place', pieceId });
  const placement = board.add(pieceId, orient, pose.x, pose.y, pose.z);
  if (!placement) {
    state.history.pop();
    return;
  }
  world.addPiece(pieceId, orient, pose);
  state.held = null;
  state.ghost = null;
  state.lastPointer = null;
  world.hideGhost();
  ui.setHeld(null);
  ui.setTipsForHeld(false);
  canvas.style.cursor = 'grab';
  world.controls.enableRotate = true;
  state.moves += 1;
  sfx.place();
  if (!state.running) startTimer();
  syncAll();

  if (board.count === PIECE_COUNT) win();
}

/* ------------------------------------------------------------------ */
/* Pistas, deshacer, reiniciar                                         */
/* ------------------------------------------------------------------ */

function hint() {
  if (state.won) return;
  if (state.held) cancelHold();
  const remaining = Array.from({ length: PIECE_COUNT }, (_, i) => i)
    .filter((id) => !board.placements.has(id));
  const found = findHint(board, remaining);
  if (!found) {
    ui.toast('No queda hueco para otra pieza. Mueve alguna o reinicia.', 'warn');
    return;
  }
  state.layer = found.y;
  ui.setLayer(found.y);
  world.setActiveLayer(found.y);
  if (state.isolate) world.setIsolation(found.y);
  state.history.push({ type: 'place', pieceId: found.pieceId });
  board.add(found.pieceId, found.orient, found.x, found.y, found.z);
  world.addPiece(found.pieceId, found.orient, found, { animate: true });
  state.moves += 1;
  if (!state.running) startTimer();
  sfx.place();
  syncAll();
  ui.toast(`Pista: pieza ${found.pieceId + 1} en la capa ${found.y + 1}.`);
  if (board.count === PIECE_COUNT) win();
}

function undo() {
  if (state.won) return;
  if (state.held) {
    cancelHold();
    return;
  }
  const action = state.history.pop();
  if (!action) return;
  if (action.type === 'place') {
    if (board.placements.has(action.pieceId)) {
      board.remove(action.pieceId);
      world.removePiece(action.pieceId);
      state.moves = Math.max(0, state.moves - 1);
      sfx.pick();
    }
  } else if (!board.placements.has(action.pieceId)) {
    const placement = board.add(action.pieceId, action.orient, action.x, action.y, action.z);
    if (placement) {
      world.addPiece(action.pieceId, action.orient, action, { animate: false });
    }
    sfx.place();
  }

  if (board.count === 0) {
    state.running = false;
    state.elapsed = 0;
    state.startedAt = 0;
  }
  syncAll();
  updateStats();
}

async function resetGame(force = false) {
  if (!force && board.count > 0) {
    const accepted = await ui.askReset();
    if (!accepted) return;
  }
  if (state.held) cancelHold();
  board.reset();
  world.clearPieces();
  state.history = [];
  state.moves = 0;
  state.running = false;
  state.elapsed = 0;
  state.startedAt = 0;
  state.won = false;
  state.layer = 0;
  state.isolate = false;
  state.lastPointer = null;
  state.ghost = null;
  state.held = null;
  world.hideGhost();
  world.setIsolation(null);
  world.setActiveLayer(0);
  ui.setHeld(null);
  ui.setIsolate(false);
  ui.hideWin();
  ui.setLayer(0);
  ui.setTipsForHeld(false);
  ui.setView('iso');
  world.setView('iso');
  world.resetMood();
  syncAll();
  ui.toast('Cubo vacío. Elige una pieza para empezar.');
}

function toggleIsolate() {
  if (state.won) return;
  state.isolate = !state.isolate;
  world.setIsolation(state.isolate ? state.layer : null);
  ui.setIsolate(state.isolate);
  if (state.isolate) ui.toast(`Aislando la capa ${state.layer + 1}.`);
}

/* ------------------------------------------------------------------ */
/* Victoria                                                            */
/* ------------------------------------------------------------------ */

function win() {
  if (state.won) return;
  state.won = true;
  state.elapsed = elapsedSeconds();
  state.running = false;
  state.held = null;
  state.ghost = null;
  world.hideGhost();
  world.controls.enableRotate = true;
  world.controls.autoRotate = true;
  world.controls.autoRotateSpeed = 0.75;
  canvas.style.cursor = 'grab';
  ui.setHeld(null);
  ui.setTipsForHeld(false);

  if (state.best === null || state.elapsed < state.best) {
    state.best = state.elapsed;
    try {
      localStorage.setItem('mariposa.best', String(state.best));
    } catch {
      /* sin almacenamiento */
    }
  }
  ui.setIsolate(false);
  state.isolate = false;
  world.setIsolation(null);
  world.celebrate();
  sfx.win();
  syncAll();
  window.setTimeout(() => {
    if (!state.won) return;
    ui.showWin({
      seconds: state.elapsed,
      moves: state.moves,
      best: state.best,
    });
  }, 850);
}

/* ------------------------------------------------------------------ */
/* Puntero                                                             */
/* ------------------------------------------------------------------ */

let press = null;

canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  sfx.unlock();
  world.stopAutoRotate();
  press = {
    x: event.clientX,
    y: event.clientY,
    moved: 0,
    canvas: true,
    time: performance.now(),
  };
  if (state.held) updateGhost(event.clientX, event.clientY);
});

window.addEventListener('pointermove', (event) => {
  if (press) {
    press.moved = Math.max(
      press.moved,
      Math.hypot(event.clientX - press.x, event.clientY - press.y),
    );
  }

  const overCanvas = event.target === canvas;
  if (!overCanvas) {
    canvas.style.cursor = 'default';
    return;
  }

  if (state.held) {
    updateGhost(event.clientX, event.clientY);
    canvas.style.cursor = 'grabbing';
  } else {
    const pieceId = world.pickPiece(event.clientX, event.clientY);
    canvas.style.cursor = pieceId !== null ? 'pointer' : 'grab';
  }
});

window.addEventListener('pointerup', (event) => {
  const pressState = press;
  press = null;
  if (!pressState) return;
  if (document.querySelector('dialog[open]') || !document.getElementById('win').hidden) return;

  const overCanvas = event.target === canvas;
  const moved = Math.hypot(event.clientX - pressState.x, event.clientY - pressState.y);

  if (state.held) {
    if (overCanvas) {
      updateGhost(event.clientX, event.clientY);
      if (state.ghost?.valid) placeHeld();
      else {
        sfx.invalid();
        ui.toast('Ahí no cabe: gira la pieza o cambia de capa.', 'warn');
      }
    }
    return;
  }

  if (overCanvas && moved < 7) {
    const pieceId = world.pickPiece(event.clientX, event.clientY);
    if (pieceId !== null) pickUpPlaced(pieceId);
  }
});

window.addEventListener('pointercancel', () => {
  press = null;
});

/* ------------------------------------------------------------------ */
/* Teclado                                                             */
/* ------------------------------------------------------------------ */

window.addEventListener('keydown', (event) => {
  if (document.querySelector('dialog[open]')) return;
  const tag = event.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (event.ctrlKey || event.metaKey) {
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    }
    return;
  }

  const key = event.key.toLowerCase();
  if (key >= '1' && key <= '5') {
    selectLayer(Number(key) - 1);
  } else if (key === 'x' || key === 'y' || key === 'z') {
    rotate(key);
  } else if (key === 'escape') {
    cancelHold();
  } else if (key === 'h') {
    hint();
  } else if (key === 'u') {
    undo();
  } else if (key === 'v') {
    toggleIsolate();
  } else if (event.key === '?') {
    ui.openHelp();
  }
});

/* ------------------------------------------------------------------ */
/* Bucle                                                               */
/* ------------------------------------------------------------------ */

let last = performance.now();
let statClock = 0;
let firstFrame = true;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  world.update(dt, now / 1000);
  statClock += dt;
  if (statClock > 0.2) {
    statClock = 0;
    if (state.running && !state.won) updateStats();
  }
  if (firstFrame) {
    firstFrame = false;
    window.setTimeout(() => ui.hideLoading(), 650);
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

ui.setStats({ placed: 0, total: PIECE_COUNT, seconds: 0, moves: 0 });
updateStats();

/* Atajos para pruebas visuales: ?demo=parcial | ?demo=win | ?demo=ghost */
const params = new URLSearchParams(window.location.search);
const demoMode = params.get('demo');
if (demoMode) {
  window.setTimeout(() => runDemo(demoMode), 900);
}

function runDemo(mode) {
  const target = mode === 'win' ? PIECE_COUNT : mode === 'ghost' ? 6 : 8;
  for (let i = 0; i < target; i += 1) {
    const remaining = Array.from({ length: PIECE_COUNT }, (_, k) => k)
      .filter((id) => !board.placements.has(id));
    const found = findHint(board, remaining);
    if (!found) break;
    board.add(found.pieceId, found.orient, found.x, found.y, found.z);
    world.addPiece(found.pieceId, found.orient, found, { animate: false });
    state.moves += 1;
  }
  if (board.count > 0 && !state.running) startTimer();
  syncAll();

  if (mode === 'ghost') {
    const remaining = Array.from({ length: PIECE_COUNT }, (_, k) => k)
      .filter((id) => !board.placements.has(id));
    if (remaining.length) {
      const pieceId = remaining[0];
      hold(pieceId, BASE_ORIENTATION, 'tray');
      state.layer = 2;
      ui.setLayer(2);
      world.setActiveLayer(2);
      const pose = { x: 0, y: 2, z: 0, valid: board.canPlace(BASE_ORIENTATION, 0, 2, 0) };
      state.ghost = pose;
      world.showGhost(BASE_ORIENTATION, pose, pose.valid);
      ui.setHeld(pieceId);
      ui.setTipsForHeld(true, pieceId);
    }
  }

  if (mode === 'win' || board.count === PIECE_COUNT) {
    win();
  }
}

/* Depuración desde la consola */
window.__mariposa = { state, board, world, ui };
