import { BASE_ORIENTATION, CUBE, PIECE_COLORS, PIECE_COUNT } from './game/shape.js';

const ISO = Math.cos(Math.PI / 6);

function iso(x, y, z) {
  return [(x - z) * ISO, (x + z) * 0.5 - y];
}

function mix(hex, target, amount) {
  const a = hex.replace('#', '');
  const b = target.replace('#', '');
  const channels = [0, 2, 4].map((i) => {
    const va = parseInt(a.slice(i, i + 2), 16);
    const vb = parseInt(b.slice(i, i + 2), 16);
    return Math.round(va + (vb - va) * amount).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

function pieceSvg(orientation, color) {
  const faces = [];
  for (const [x, y, z] of orientation.cells) {
    const top = [iso(x, y + 1, z), iso(x + 1, y + 1, z), iso(x + 1, y + 1, z + 1), iso(x, y + 1, z + 1)];
    const right = [iso(x + 1, y, z), iso(x + 1, y, z + 1), iso(x + 1, y + 1, z + 1), iso(x + 1, y + 1, z)];
    const front = [iso(x, y, z + 1), iso(x + 1, y, z + 1), iso(x + 1, y + 1, z + 1), iso(x, y + 1, z + 1)];
    faces.push({ depth: x + z + 0.001, points: top, fill: mix(color, '#fff6e3', 0.22) });
    faces.push({ depth: x + z, points: right, fill: color });
    faces.push({ depth: x + z, points: front, fill: mix(color, '#2a160b', 0.28) });
  }
  faces.sort((a, b) => a.depth - b.depth);

  const all = faces.flatMap((f) => f.points);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const pad = 0.22;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const width = Math.max(...xs) - minX + pad;
  const height = Math.max(...ys) - minY + pad;

  const polygons = faces
    .map((face) => {
      const pts = face.points.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' ');
      return `<polygon points="${pts}" fill="${face.fill}" stroke="rgba(30,14,5,0.28)" stroke-width="0.025" stroke-linejoin="round"/>`;
    })
    .join('');

  return `<svg viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}" role="img" aria-hidden="true" focusable="false">${polygons}</svg>`;
}

const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export class UI {
  constructor(handlers) {
    this.handlers = handlers;
    this.placed = new Set();
    this.soundOn = true;
    this.currentView = 'iso';
    this.toastTimer = null;
    this.resetResolve = null;

    this.el = {
      tray: document.getElementById('tray'),
      layers: document.getElementById('layers'),
      layerLabel: document.getElementById('layer-label'),
      statsPieces: document.getElementById('stat-pieces'),
      statsTime: document.getElementById('stat-time'),
      statsMoves: document.getElementById('stat-moves'),
      tip: document.getElementById('tip'),
      undo: document.getElementById('btn-undo'),
      isolate: document.getElementById('btn-isolate'),
      sound: document.getElementById('btn-sound'),
      toast: document.getElementById('toast'),
      win: document.getElementById('win'),
      winTime: document.getElementById('win-time'),
      winMoves: document.getElementById('win-moves'),
      winBest: document.getElementById('win-best'),
      winParticles: document.getElementById('win-particles'),
      help: document.getElementById('help'),
      confirm: document.getElementById('confirm'),
      loading: document.getElementById('loading'),
    };

    this.buildTray();
    this.buildLayers();
    this.bind();
  }

  buildTray() {
    this.el.tray.innerHTML = Array.from({ length: PIECE_COUNT }, (_, i) => {
      const color = PIECE_COLORS[i % PIECE_COLORS.length];
      return `
        <button class="tray-slot${i === 0 ? ' is-first' : ''}" type="button" data-piece="${i}"
          aria-label="Pieza ${i + 1}" title="Pieza ${i + 1}">
          <span class="slot-number">${String(i + 1).padStart(2, '0')}</span>
          <span class="slot-shape">${pieceSvg(BASE_ORIENTATION, color)}</span>
          <span class="slot-check" aria-hidden="true">
            <svg viewBox="0 0 12 12"><path d="M2.5 6.2 4.7 8.4 9.6 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </button>`;
    }).join('');
  }

  buildLayers() {
    this.el.layers.innerHTML = Array.from({ length: CUBE }, (_, i) => {
      const layer = CUBE - 1 - i;
      return `
        <button class="layer${layer === 0 ? ' is-active' : ''}" type="button" data-layer="${layer}"
          aria-label="Capa ${layer + 1}" aria-pressed="${layer === 0}">
          <span class="layer-num">${layer + 1}</span>
          <span class="layer-track"><span class="layer-fill"></span></span>
          <span class="layer-count">0/25</span>
        </button>`;
    }).join('');
    this.el.layerLabel.textContent = '1';
  }

  bind() {
    this.el.tray.addEventListener('click', (event) => {
      const button = event.target.closest('.tray-slot');
      if (!button) return;
      this.el.tray.querySelectorAll('.tray-slot').forEach((slot) => slot.classList.remove('is-first'));
      this.handlers.onPick(Number(button.dataset.piece));
    });

    this.el.layers.addEventListener('click', (event) => {
      const button = event.target.closest('.layer');
      if (!button) return;
      this.handlers.onLayer(Number(button.dataset.layer));
    });

    document.querySelectorAll('[data-rotate]').forEach((button) => {
      button.addEventListener('click', () => this.handlers.onRotate(button.dataset.rotate));
    });

    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        this.handlers.onView(button.dataset.view);
        this.setView(button.dataset.view);
      });
    });

    document.getElementById('btn-hint').addEventListener('click', () => this.handlers.onHint());
    this.el.undo.addEventListener('click', () => this.handlers.onUndo());
    document.getElementById('btn-reset').addEventListener('click', () => this.handlers.onReset());
    document.getElementById('btn-help').addEventListener('click', () => this.openHelp());
    document.getElementById('btn-help-close').addEventListener('click', () => this.el.help.close());

    this.el.sound.addEventListener('click', () => this.handlers.onSound());
    this.el.isolate.addEventListener('click', () => this.handlers.onIsolate());

    document.querySelectorAll('[data-win="again"]').forEach((button) => {
      button.addEventListener('click', () => this.handlers.onReset(true));
    });
    document.querySelectorAll('[data-win="close"]').forEach((button) => {
      button.addEventListener('click', () => this.hideWin());
    });

    this.el.help.addEventListener('click', (event) => {
      if (event.target === this.el.help) this.el.help.close();
    });

    this.el.confirm.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.answerReset(false);
    });
    this.el.confirm.querySelector('[data-confirm="yes"]').addEventListener('click', () => this.answerReset(true));
    this.el.confirm.querySelector('[data-confirm="no"]').addEventListener('click', () => this.answerReset(false));
    this.el.confirm.addEventListener('click', (event) => {
      if (event.target === this.el.confirm) this.answerReset(false);
    });

    this.el.win.addEventListener('click', (event) => {
      if (event.target === this.el.win) this.hideWin();
    });
  }

  setPlaced(ids) {
    this.placed = new Set(ids);
    this.el.tray.querySelectorAll('.tray-slot').forEach((slot) => {
      const id = Number(slot.dataset.piece);
      const placed = this.placed.has(id);
      slot.classList.toggle('is-placed', placed);
      slot.setAttribute('aria-label', placed ? `Pieza ${id + 1}, colocada` : `Pieza ${id + 1}`);
    });
  }

  setHeld(pieceId) {
    this.el.tray.querySelectorAll('.tray-slot').forEach((slot) => {
      slot.classList.toggle('is-held', pieceId !== null && Number(slot.dataset.piece) === pieceId);
    });
  }

  setLayer(layer) {
    this.el.layers.querySelectorAll('.layer').forEach((button) => {
      const active = Number(button.dataset.layer) === layer;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    this.el.layerLabel.textContent = String(layer + 1);
  }

  setLayerCounts(counts) {
    this.el.layers.querySelectorAll('.layer').forEach((button) => {
      const layer = Number(button.dataset.layer);
      const count = counts[layer] || 0;
      button.querySelector('.layer-fill').style.width = `${(count / 25) * 100}%`;
      button.querySelector('.layer-count').textContent = `${count}/25`;
    });
  }

  setStats({ placed, total, seconds, moves }) {
    this.el.statsPieces.textContent = `${placed}/${total}`;
    this.el.statsTime.textContent = formatTime(seconds);
    this.el.statsMoves.textContent = String(moves);
    this.el.statsTime.classList.toggle('is-running', placed > 0);
  }

  setUndoEnabled(enabled) {
    this.el.undo.disabled = !enabled;
    this.el.undo.classList.toggle('is-disabled', !enabled);
  }

  setIsolate(enabled) {
    this.el.isolate.classList.toggle('is-on', enabled);
    this.el.isolate.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    this.el.isolate.setAttribute('aria-label', enabled ? 'Mostrar todas las capas' : 'Aislar capa');
    this.el.isolate.querySelector('span').textContent = enabled ? 'Ver todo' : 'Aislar capa';
  }

  setSound(enabled) {
    this.soundOn = enabled;
    this.el.sound.classList.toggle('is-muted', !enabled);
    this.el.sound.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    this.el.sound.setAttribute('aria-label', enabled ? 'Silenciar sonido' : 'Activar sonido');
  }

  setView(view) {
    this.currentView = view;
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.view === view);
    });
  }

  setTip(text) {
    this.el.tip.innerHTML = text;
  }

  setHintEnabled(enabled) {
    const button = document.getElementById('btn-hint');
    button.disabled = !enabled;
    button.classList.toggle('is-disabled', !enabled);
  }

  toast(message, tone = 'normal') {
    const toast = this.el.toast;
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.classList.add('is-visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  hideToast() {
    window.clearTimeout(this.toastTimer);
    this.el.toast.classList.remove('is-visible');
  }

  askReset() {
    return new Promise((resolve) => {
      this.resetResolve = resolve;
      this.el.confirm.showModal();
    });
  }

  answerReset(answer) {
    if (!this.resetResolve) return;
    const resolve = this.resetResolve;
    this.resetResolve = null;
    this.el.confirm.close();
    resolve(answer);
  }

  openHelp() {
    this.el.help.showModal();
  }

  closeHelp() {
    this.el.help.close();
  }

  showWin({ seconds, moves, best }) {
    this.hideToast();
    this.el.winTime.textContent = formatTime(seconds);
    this.el.winMoves.textContent = String(moves);
    this.el.winBest.textContent = best === null ? '—' : formatTime(best);
    this.el.win.hidden = false;
    this.el.win.classList.add('is-open');
    this.spawnParticles();
    const again = this.el.win.querySelector('[data-win="again"]');
    if (again) again.focus({ preventScroll: true });
  }

  hideWin() {
    this.el.win.classList.remove('is-open');
    window.setTimeout(() => {
      if (!this.el.win.classList.contains('is-open')) this.el.win.hidden = true;
    }, 450);
  }

  spawnParticles() {
    const container = this.el.winParticles;
    container.innerHTML = '';
    for (let i = 0; i < 32; i += 1) {
      const particle = document.createElement('span');
      particle.style.setProperty('--x', `${8 + Math.random() * 84}%`);
      particle.style.setProperty('--delay', `${Math.random() * 2.2}s`);
      particle.style.setProperty('--duration', `${3 + Math.random() * 3}s`);
      particle.style.setProperty('--size', `${3 + Math.random() * 5}px`);
      particle.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
      container.appendChild(particle);
    }
  }

  hideLoading() {
    this.el.loading.classList.add('is-hidden');
    window.setTimeout(() => this.el.loading.remove(), 900);
  }

  setTipsForHeld(hasHeld, pieceNumber) {
    if (hasHeld) {
      this.setTip(`Pieza <b>${String(pieceNumber + 1).padStart(2, '0')}</b> en mano · toca el cubo para colocarla · <kbd>X</kbd><kbd>Y</kbd><kbd>Z</kbd> gira`);
    } else {
      this.setTip('Elige una pieza de la bandeja · cambia de capa con <kbd>1</kbd>–<kbd>5</kbd>');
    }
  }
}

export { formatTime };
