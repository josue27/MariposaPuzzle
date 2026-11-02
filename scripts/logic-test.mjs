/* Pruebas rápidas de la lógica del puzzle (sin navegador). */
import { ORIENTATIONS, CUBE, PIECE_COUNT, rotateOrientation } from '../src/game/shape.js';
import { Board } from '../src/game/board.js';
import { findHint } from '../src/game/solver.js';

let failures = 0;
const check = (name, condition, extra = '') => {
  if (condition) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${extra}`);
  }
};

console.log(`Orientaciones únicas: ${ORIENTATIONS.length}`);
check('la pieza tiene 5 cubos', ORIENTATIONS.every((o) => o.cells.length === 5));
check('todas caben en 3x3x3', ORIENTATIONS.every((o) => o.size.every((s) => s <= 3)));
check('12 orientaciones', ORIENTATIONS.length === 12, `-> ${ORIENTATIONS.length}`);

const base = ORIENTATIONS[0];
check('la rotación vuelve al conjunto', ORIENTATIONS.includes(rotateOrientation(base, 'x')));
for (const axis of ['x', 'y', 'z']) {
  let o = base;
  for (let i = 0; i < 4; i += 1) o = rotateOrientation(o, axis);
  check(`4 giros en ${axis} = identidad`, o.key === base.key);
}

const board = new Board();
check('coloca en el suelo', !!board.add(0, base, 1, 0, 1));
check('no permite solaparse', board.canPlace(base, 1, 0, 1) === false);
check('no permite salirse', board.canPlace(base, 3, 0, 3) === false);
check('cuenta celdas por capa', board.layerCounts()[0] === 5, JSON.stringify(board.layerCounts()));

const snap = board.snapshot();
board.remove(0);
check('se puede quitar', board.count === 0 && board.occupancy.every((v) => v === 0));
board.restore(snap);
check('restaura instantánea', board.count === 1 && board.layerCounts()[0] === 5);

// Simula 11 pistas seguidas: es la garantía de que el botón "Pista" puede
// terminar el puzzle sin bloquearse.
const sim = new Board();
const remaining = Array.from({ length: PIECE_COUNT }, (_, i) => i);
let steps = 0;
while (remaining.length) {
  const hint = findHint(sim, remaining);
  if (!hint) break;
  sim.add(hint.pieceId, hint.orient, hint.x, hint.y, hint.z);
  remaining.splice(remaining.indexOf(hint.pieceId), 1);
  steps += 1;
  console.log(
    `  pista ${String(steps).padStart(2)}  pieza ${hint.pieceId + 1}  ` +
    `origen (${hint.x},${hint.y},${hint.z})  capas ${hint.y}-${hint.y + hint.orient.size[1] - 1}`,
  );
}
check('11 pistas caben dentro del cubo', steps === PIECE_COUNT, `-> ${steps}`);
check('55 celdas ocupadas', sim.layerCounts().reduce((a, b) => a + b, 0) === 55);
check('sin solapamientos', sim.occupancy.filter((v) => v > 0).length === 55);
check('todo dentro de 5x5x5', sim.placements.size === PIECE_COUNT);

if (failures) {
  console.error(`\n${failures} fallo(s)`);
  process.exit(1);
}
console.log('\nLógica OK');
