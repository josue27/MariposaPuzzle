/**
 * Geometría del puzzle "Mariposa".
 *
 * Cada pieza es una L de 5 celdas extruida dos veces en altura: dos barras de
 * 3 × 2 unidas en ángulo recto y compartiendo la esquina. Ocupa 10 cubos
 * (3 + 3 - 1 = 5 celdas × 2 de grosor) y cabe en una caja de 3×2×3.
 */

export const CUBE = 5;
export const PIECE_COUNT = 11;

/** Celdas de la pieza en su orientación base, apoyada en el suelo. */
const BASE_CELLS = [
  [0, 0, 0], [1, 0, 0], [2, 0, 0],
  [0, 0, 1], [0, 0, 2],
  [0, 1, 0], [1, 1, 0], [2, 1, 0],
  [0, 1, 1], [0, 1, 2],
];

const keyOf = (cells) =>
  cells
    .map((c) => c.join(','))
    .sort()
    .join('|');

/** Traslada la pieza para que su caja envolvente empiece en (0,0,0). */
function normalize(cells) {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  const minZ = Math.min(...cells.map((c) => c[2]));
  const shifted = cells.map(([x, y, z]) => [x - minX, y - minY, z - minZ]);
  shifted.sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0] - b[0]);
  const maxX = Math.max(...shifted.map((c) => c[0]));
  const maxY = Math.max(...shifted.map((c) => c[1]));
  const maxZ = Math.max(...shifted.map((c) => c[2]));
  return {
    cells: shifted,
    size: [maxX + 1, maxY + 1, maxZ + 1],
    key: keyOf(shifted),
  };
}

/** Rotaciones de 90° alrededor de los tres ejes. */
const ROTATE = {
  x: ([x, y, z]) => [x, -z, y],
  y: ([x, y, z]) => [z, y, -x],
  z: ([x, y, z]) => [-y, x, z],
};

const orientationMap = new Map();
const queue = [normalize(BASE_CELLS)];
orientationMap.set(queue[0].key, queue[0]);

while (queue.length) {
  const current = queue.shift();
  for (const axis of ['x', 'y', 'z']) {
    const next = normalize(current.cells.map(ROTATE[axis]));
    if (!orientationMap.has(next.key)) {
      orientationMap.set(next.key, next);
      queue.push(next);
    }
  }
}

/** Las 12 orientaciones únicas que puede adoptar la pieza. */
export const ORIENTATIONS = [...orientationMap.values()];

export const ORIENTATION_BY_KEY = orientationMap;

/** Orientación inicial: la L plana sobre el suelo. */
export const BASE_ORIENTATION = ORIENTATIONS[0];

/** Gira una orientación 90° sobre el eje indicado ('x' | 'y' | 'z'). */
export function rotateOrientation(orientation, axis) {
  const rotated = normalize(orientation.cells.map(ROTATE[axis]));
  return orientationMap.get(rotated.key) ?? rotated;
}

export const PIECE_COLORS = [
  '#d79c63', '#cb8b52', '#dfa870', '#c58148', '#d2945a', '#bd7a43',
  '#e0ad77', '#cc8c50', '#d89f66', '#c07d44', '#d09056',
];
