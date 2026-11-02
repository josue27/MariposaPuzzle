import { ORIENTATIONS, ORIENTATION_BY_KEY } from './shape.js';

const FLAT = ORIENTATIONS.filter((o) => o.size[1] === 1 && o.cells.length === 5);

const BASE_KEY = '0,0,0|0,0,1|0,0,2|1,0,0|2,0,0';

/**
 * Receta densa: 4 piezas planas por capa en las dos primeras capas y 3 en la
 * tercera. Deja un hueco de 5 celdas por capa (no existe teselado de 5 Ls en
 * un cuadrado de 5×5), pero es mucho más bonito que amontonar piezas.
 */
const RECIPE = [
  { key: BASE_KEY, x: 1, y: 0, z: 0 },
  { key: '0,0,0|0,0,1|0,0,2|1,0,2|2,0,2', x: 0, y: 0, z: 1 },
  { key: '0,0,2|1,0,2|2,0,0|2,0,1|2,0,2', x: 1, y: 0, z: 2 },
  { key: '0,0,0|1,0,0|2,0,0|2,0,1|2,0,2', x: 2, y: 0, z: 1 },

  { key: BASE_KEY, x: 1, y: 1, z: 0 },
  { key: '0,0,0|0,0,1|0,0,2|1,0,2|2,0,2', x: 0, y: 1, z: 1 },
  { key: '0,0,2|1,0,2|2,0,0|2,0,1|2,0,2', x: 1, y: 1, z: 2 },
  { key: '0,0,0|1,0,0|2,0,0|2,0,1|2,0,2', x: 2, y: 1, z: 1 },

  { key: BASE_KEY, x: 0, y: 2, z: 0 },
  { key: BASE_KEY, x: 1, y: 2, z: 1 },
  { key: BASE_KEY, x: 2, y: 2, z: 2 },
];

function firstRecipeSpot(board) {
  for (const step of RECIPE) {
    const orient = ORIENTATION_BY_KEY.get(step.key);
    if (!orient) continue;
    if (board.canPlace(orient, step.x, step.y, step.z)) {
      return { orient, x: step.x, y: step.y, z: step.z };
    }
  }
  return null;
}

/**
 * Busca una colocación válida para una de las piezas que quedan fuera.
 * Primero intenta seguir la receta densa; si está bloqueada, prioriza piezas
 * planas, capas bajas y el centro.
 */
export function findHint(board, pieceIds) {
  if (!pieceIds.length) return null;

  const recipe = firstRecipeSpot(board);
  if (recipe) {
    return { pieceId: pieceIds[0], ...recipe };
  }

  const bestIn = (orientations) => {
    let best = null;
    for (const pieceId of pieceIds) {
      for (const orient of orientations) {
        const [sx, sy, sz] = orient.size;
        for (let y = 0; y <= 5 - sy; y += 1) {
          for (let z = 0; z <= 5 - sz; z += 1) {
            for (let x = 0; x <= 5 - sx; x += 1) {
              if (!board.canPlace(orient, x, y, z)) continue;
              const cx = x + sx / 2 - 2.5;
              const cz = z + sz / 2 - 2.5;
              const score = y * 1000 + (cx * cx + cz * cz) * 4;
              if (!best || score < best.score) {
                best = { pieceId, orient, x, y, z, score };
              }
            }
          }
        }
      }
      if (best) break;
    }
    return best;
  };

  return bestIn(FLAT) ?? bestIn(ORIENTATIONS);
}
