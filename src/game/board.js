import { CUBE, ORIENTATION_BY_KEY } from './shape.js';

const VOLUME = CUBE * CUBE * CUBE;

export const indexOf = (x, y, z) => x + CUBE * (z + CUBE * y);

/**
 * Estado del cubo: qué celdas están ocupadas y por qué pieza.
 * No conoce nada de Three.js, así que se puede probar en Node.
 */
export class Board {
  constructor() {
    this.occupancy = new Uint8Array(VOLUME);
    /** @type {Map<number, {pieceId:number, orient:object, x:number, y:number, z:number, cells:number[][]}>} */
    this.placements = new Map();
  }

  get count() {
    return this.placements.size;
  }

  absoluteCells(orient, x, y, z) {
    return orient.cells.map(([cx, cy, cz]) => [x + cx, y + cy, z + cz]);
  }

  fitsInside(orient, x, y, z) {
    const [sx, sy, sz] = orient.size;
    return x >= 0 && y >= 0 && z >= 0 &&
      x + sx <= CUBE && y + sy <= CUBE && z + sz <= CUBE;
  }

  canPlace(orient, x, y, z) {
    if (!this.fitsInside(orient, x, y, z)) return false;
    for (const [cx, cy, cz] of orient.cells) {
      if (this.occupancy[indexOf(x + cx, y + cy, z + cz)] !== 0) return false;
    }
    return true;
  }

  add(pieceId, orient, x, y, z) {
    if (!this.canPlace(orient, x, y, z)) return null;
    const cells = this.absoluteCells(orient, x, y, z);
    for (const [cx, cy, cz] of cells) {
      this.occupancy[indexOf(cx, cy, cz)] = pieceId + 1;
    }
    const placement = { pieceId, orient, x, y, z, cells };
    this.placements.set(pieceId, placement);
    return placement;
  }

  remove(pieceId) {
    const placement = this.placements.get(pieceId);
    if (!placement) return null;
    for (const [cx, cy, cz] of placement.cells) {
      this.occupancy[indexOf(cx, cy, cz)] = 0;
    }
    this.placements.delete(pieceId);
    return placement;
  }

  /** Celdas ocupadas en cada una de las 5 capas. */
  layerCounts() {
    const counts = new Array(CUBE).fill(0);
    for (let y = 0; y < CUBE; y += 1) {
      for (let z = 0; z < CUBE; z += 1) {
        for (let x = 0; x < CUBE; x += 1) {
          if (this.occupancy[indexOf(x, y, z)]) counts[y] += 1;
        }
      }
    }
    return counts;
  }

  reset() {
    this.occupancy.fill(0);
    this.placements.clear();
  }

  /** Copia serializable para deshacer. */
  snapshot() {
    return [...this.placements.values()].map((p) => ({
      pieceId: p.pieceId,
      key: p.orient.key,
      x: p.x,
      y: p.y,
      z: p.z,
    }));
  }

  restore(snapshot) {
    this.reset();
    for (const item of snapshot) {
      const orient = ORIENTATION_BY_KEY.get(item.key);
      if (orient) this.add(item.pieceId, orient, item.x, item.y, item.z);
    }
  }
}
