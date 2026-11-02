import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CUBE, PIECE_COLORS } from '../game/shape.js';
import {
  woodTexture,
  contactShadowTexture,
  lightPoolTexture,
  sparkTexture,
  plaqueTexture,
} from './textures.js';

const HALF = CUBE / 2;

export const gridToWorld = (x, y, z) =>
  new THREE.Vector3(x - HALF, y, z - HALF);

const cellKey = (c) => c.join(',');
const DIRECTIONS = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

/**
 * La pieza se dibuja como dos barras de madera unidas en ángulo recto.
 * A partir de las celdas se localiza la esquina y se reconstruyen las barras,
 * así funciona en cualquiera de las 12 orientaciones.
 */
function armBoxes(cells) {
  const set = new Set(cells.map(cellKey));
  let corner = null;
  let cornerDirs = null;

  for (const cell of cells) {
    const neighbours = DIRECTIONS.filter((d) =>
      set.has(cellKey([cell[0] + d[0], cell[1] + d[1], cell[2] + d[2]])),
    );
    if (neighbours.length === 2) {
      const axisA = neighbours[0].findIndex((v) => v !== 0);
      const axisB = neighbours[1].findIndex((v) => v !== 0);
      if (axisA !== axisB) {
        corner = cell;
        cornerDirs = neighbours;
        break;
      }
    }
  }

  if (!corner) {
    // Respaldo improbable: una caja por celda.
    return cells.map((c) => ({ center: [c[0] + 0.5, c[1] + 0.5, c[2] + 0.5], size: [1, 1, 1] }));
  }

  return cornerDirs.map((dir) => {
    const arm = [corner];
    for (let step = 1; step <= 2; step += 1) {
      arm.push([corner[0] + dir[0] * step, corner[1] + dir[1] * step, corner[2] + dir[2] * step]);
    }
    const min = [0, 0, 0];
    const max = [0, 0, 0];
    for (let a = 0; a < 3; a += 1) {
      min[a] = Math.min(...arm.map((c) => c[a]));
      max[a] = Math.max(...arm.map((c) => c[a]));
    }
    return {
      center: [min[0] + (max[0] - min[0] + 1) / 2, min[1] + (max[1] - min[1] + 1) / 2, min[2] + (max[2] - min[2] + 1) / 2],
      size: [max[0] - min[0] + 1, max[1] - min[1] + 1, max[2] - min[2] + 1],
    };
  });
}

function buildPieceObject(orient, material, { ghost = false } = {}) {
  const group = new THREE.Group();
  const arms = armBoxes(orient.cells);
  const meshes = [];
  const lines = [];

  arms.forEach((arm, i) => {
    const inset = ghost ? 0.02 : i === 0 ? 0.018 : 0.03;
    const dims = arm.size.map((s) => Math.max(0.2, s - inset));
    const geometry = new RoundedBoxGeometry(dims[0], dims[1], dims[2], 3, 0.055);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...arm.center);
    mesh.castShadow = !ghost;
    mesh.receiveShadow = !ghost;
    group.add(mesh);
    meshes.push(mesh);

    if (ghost) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(...arm.size)),
        new THREE.LineBasicMaterial({
          color: 0xa7ffc4,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
      );
      edges.position.set(...arm.center);
      group.add(edges);
      lines.push(edges);
    }
  });

  return { group, meshes, lines };
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.disposed = false;
    this.isolation = null;
    this.activeLayer = 0;
    this.pieces = new Map();
    this.tweens = [];
    this.cameraTween = null;
    this.ghostKey = null;
    this.ghost = null;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.97;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0b0806, 0.017);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 140);
    this.camera.position.set(11.5, 12.2, 14.5);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 2.35, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 38;
    this.controls.minPolarAngle = 0.14;
    this.controls.maxPolarAngle = 1.2;
    this.controls.rotateSpeed = 0.65;
    this.controls.zoomSpeed = 0.8;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.update();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.plane = new THREE.Plane();
    this.scratch = new THREE.Vector3();

    this.materials = this.createMaterials();
    this.buildEnvironment();
    this.buildLights();
    this.buildTable();
    this.buildCube();
    this.buildHeightRings();
    this.buildLayerGuide();
    this.buildGroups();

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  createMaterials() {
    const pieceGrain = woodTexture({ seed: 21, strength: 1.8 });
    const darkGrain = woodTexture({ base: '#3d2a1c', dark: '#150c07', light: '#5a3d29', seed: 8 });
    const floorGrain = woodTexture({ base: '#c8a57d', dark: '#7c5534', light: '#e3c6a2', seed: 31 });

    const pieceMaterials = PIECE_COLORS.map((color) => new THREE.MeshPhysicalMaterial({
      map: pieceGrain,
      color: new THREE.Color(color),
      roughness: 0.6,
      metalness: 0.015,
      clearcoat: 0.16,
      clearcoatRoughness: 0.62,
      envMapIntensity: 0.42,
    }));

    const frame = new THREE.MeshPhysicalMaterial({
      map: darkGrain,
      color: 0xd2a87e,
      roughness: 0.46,
      metalness: 0.03,
      clearcoat: 0.28,
      clearcoatRoughness: 0.58,
      envMapIntensity: 0.45,
    });

    return {
      pieceGrain,
      darkGrain,
      floorGrain,
      pieceMaterials,
      frame,
      slab: new THREE.MeshPhysicalMaterial({
        map: darkGrain,
        color: 0x8b6247,
        roughness: 0.52,
        metalness: 0.03,
        clearcoat: 0.2,
      }),
      floor: new THREE.MeshPhysicalMaterial({
        map: floorGrain,
        color: 0xbb855d,
        roughness: 0.58,
        metalness: 0,
        envMapIntensity: 0.3,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: 0xc79a58,
        roughness: 0.32,
        metalness: 0.85,
        envMapIntensity: 0.9,
      }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0xc7dbe4,
        transparent: true,
        opacity: 0.028,
        roughness: 0.03,
        metalness: 0,
        envMapIntensity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
      }),
      ghostOk: new THREE.MeshBasicMaterial({
        color: 0x3ee089,
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      ghostBad: new THREE.MeshBasicMaterial({
        color: 0xff5a45,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      ghostOkLine: new THREE.LineBasicMaterial({
        color: 0xb9ffd8,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      }),
      ghostBadLine: new THREE.LineBasicMaterial({
        color: 0xffd0c7,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      }),
      ghostOkCell: new THREE.MeshBasicMaterial({
        color: 0x7dffb0,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      ghostBadCell: new THREE.MeshBasicMaterial({
        color: 0xff7a62,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      table: new THREE.MeshStandardMaterial({
        map: woodTexture({ base: '#2e1f16', dark: '#0d0704', light: '#4c3323', planks: true, seed: 5 }),
        roughness: 0.8,
        metalness: 0,
      }),
      layerLine: new THREE.LineBasicMaterial({
        color: 0xe8b77c,
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
      }),
      ringLine: new THREE.LineBasicMaterial({
        color: 0xe5b47a,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
      }),
      floorLine: new THREE.LineBasicMaterial({
        color: 0x2a170d,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    };
  }

  buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = env.texture;
    this.scene.environmentIntensity = 0.38;
    pmrem.dispose();
    this.envTexture = env.texture;
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xffe3c0, 0x1b110b, 0.5);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffd3a0, 2.7);
    key.position.set(7.5, 18, 5.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 5;
    this.scene.add(key);
    this.keyLight = key;

    const warmFill = new THREE.PointLight(0xffb774, 18, 26, 1.8);
    warmFill.position.set(-5.5, 5.2, 7);
    this.scene.add(warmFill);

    const blueRim = new THREE.PointLight(0x4c74ff, 38, 22, 1.7);
    blueRim.position.set(-6.5, 3.6, -7.5);
    this.scene.add(blueRim);

    const underGlow = new THREE.PointLight(0xff9c52, 8, 8, 2);
    underGlow.position.set(0, -0.2, 0);
    this.scene.add(underGlow);
  }

  buildTable() {
    const table = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), this.materials.table);
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.54;
    table.receiveShadow = true;
    this.scene.add(table);
    this.materials.table.map.repeat.set(16, 16);
    this.materials.table.map.rotation = Math.PI * 0.08;

    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 15),
      new THREE.MeshBasicMaterial({
        map: lightPoolTexture(),
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -0.53;
    this.scene.add(pool);

    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(10.5, 10.5),
      new THREE.MeshBasicMaterial({
        map: contactShadowTexture(),
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = -0.525;
    this.scene.add(contact);

    // Motas de polvo suspendidas en la luz
    const count = 150;
    const positions = new Float32Array(count * 3);
    this.moteSeed = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 13;
      positions[i * 3 + 1] = 0.2 + Math.random() * 7;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 13;
      this.moteSeed[i] = Math.random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const motes = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        map: sparkTexture(),
        color: 0xffd8a6,
        size: 0.05,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    this.scene.add(motes);
    this.motes = motes;
  }

  buildCube() {
    const { frame, slab, floor, brass, glass, floorLine } = this.materials;
    const cube = new THREE.Group();
    this.cube = cube;
    this.scene.add(cube);

    const base = new THREE.Mesh(new RoundedBoxGeometry(5.95, 0.5, 5.95, 4, 0.09), slab);
    base.position.y = -0.26;
    base.castShadow = true;
    base.receiveShadow = true;
    cube.add(base);

    const playFloor = new THREE.Mesh(new RoundedBoxGeometry(5.02, 0.09, 5.02, 2, 0.02), floor);
    playFloor.position.y = -0.047;
    playFloor.receiveShadow = true;
    cube.add(playFloor);

    const gridPoints = [];
    for (let i = 0; i <= CUBE; i += 1) {
      const t = -HALF + i;
      gridPoints.push(-HALF, 0.006, t, HALF, 0.006, t);
      gridPoints.push(t, 0.006, -HALF, t, 0.006, HALF);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
    cube.add(new THREE.LineSegments(gridGeo, floorLine));

    // Cristal en las cuatro paredes (el cubo está abierto por arriba)
    const panelGeo = new THREE.PlaneGeometry(CUBE, CUBE);
    const sides = [
      { pos: [0, CUBE / 2, HALF], rot: [0, 0, 0] },
      { pos: [0, CUBE / 2, -HALF], rot: [0, Math.PI, 0] },
      { pos: [HALF, CUBE / 2, 0], rot: [0, Math.PI / 2, 0] },
      { pos: [-HALF, CUBE / 2, 0], rot: [0, -Math.PI / 2, 0] },
    ];
    for (const side of sides) {
      const panel = new THREE.Mesh(panelGeo, glass);
      panel.position.set(...side.pos);
      panel.rotation.set(...side.rot);
      panel.renderOrder = 4;
      cube.add(panel);
    }

    // Marco de madera
    const postGeo = new THREE.BoxGeometry(0.17, 5.16, 0.17);
    for (const x of [-2.56, 2.56]) {
      for (const z of [-2.56, 2.56]) {
        const post = new THREE.Mesh(postGeo, frame);
        post.position.set(x, 2.58, z);
        post.receiveShadow = true;
        cube.add(post);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.24), brass);
        cap.position.set(x, 5.13, z);
        cube.add(cap);
      }
    }

    const railXGeo = new THREE.BoxGeometry(5.3, 0.15, 0.14);
    const railZGeo = new THREE.BoxGeometry(0.14, 0.15, 5.3);
    for (const y of [0.16, 5.05]) {
      for (const z of [-2.56, 2.56]) {
        const rail = new THREE.Mesh(railXGeo, frame);
        rail.position.set(0, y, z);
        cube.add(rail);
      }
      for (const x of [-2.56, 2.56]) {
        const rail = new THREE.Mesh(railZGeo, frame);
        rail.position.set(x, y, 0);
        cube.add(rail);
      }
    }

    // Placa grabada en el frente
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(1.85, 0.35),
      new THREE.MeshStandardMaterial({
        map: plaqueTexture(),
        roughness: 0.36,
        metalness: 0.65,
        envMapIntensity: 0.8,
      }),
    );
    plaque.position.set(0, -0.24, 2.981);
    cube.add(plaque);
  }

  buildHeightRings() {
    const points = [];
    const r = HALF - 0.012;
    for (let y = 1; y < CUBE; y += 1) {
      points.push(
        -r, y, -r, r, y, -r,
        r, y, -r, r, y, r,
        r, y, r, -r, y, r,
        -r, y, r, -r, y, -r,
      );
    }
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      points.push(
        x * r, 0.02, z * r,
        x * r, CUBE, z * r,
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const rings = new THREE.LineSegments(geometry, this.materials.ringLine);
    rings.renderOrder = 2;
    this.scene.add(rings);
  }

  buildLayerGuide() {
    const points = [];
    for (let i = 0; i <= CUBE; i += 1) {
      const t = -HALF + i;
      points.push(-HALF, 0, t, HALF, 0, t);
      points.push(t, 0, -HALF, t, 0, HALF);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    this.layerGuide = new THREE.LineSegments(geo, this.materials.layerLine);
    this.layerGuide.position.y = 0.012;
    this.layerGuide.renderOrder = 3;
    this.scene.add(this.layerGuide);
  }

  buildGroups() {
    this.piecesGroup = new THREE.Group();
    this.scene.add(this.piecesGroup);

    this.ghostRoot = new THREE.Group();
    this.ghostRoot.visible = false;
    this.scene.add(this.ghostRoot);
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = width < 860 ? 40 : 34;
    this.camera.updateProjectionMatrix();

    if (!this.viewInitialised) {
      this.viewInitialised = true;
      if (width < 860) {
        this.camera.position.set(15.5, 19, 18.5);
      }
    }
  }

  /** Punto del plano horizontal y = height bajo el puntero. */
  layerPoint(clientX, clientY, height) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.plane.set(new THREE.Vector3(0, 1, 0), -height);
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.scratch);
    return hit ? hit.clone() : null;
  }

  pickPiece(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.piecesGroup.children, true);
    if (!hits.length) return null;
    let object = hits[0].object;
    while (object && object.userData.pieceId === undefined) object = object.parent;
    return object ? object.userData.pieceId : null;
  }

  showGhost(orient, pose, valid) {
    if (!this.ghost || this.ghostKey !== orient.key) {
      if (this.ghost) {
        this.ghostRoot.remove(this.ghost.group);
        this.ghost.group.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
        });
      }
      this.ghost = buildPieceObject(orient, this.materials.ghostOk, { ghost: true });
      this.ghostKey = orient.key;
      this.ghostRoot.add(this.ghost.group);

      const cellsGeo = new THREE.PlaneGeometry(0.92, 0.92);
      for (const [x, y, z] of orient.cells) {
        if (y !== 0) continue;
        const plate = new THREE.Mesh(cellsGeo, this.materials.ghostOkCell);
        plate.rotation.x = -Math.PI / 2;
        plate.position.set(x + 0.5, 0.026, z + 0.5);
        this.ghost.group.add(plate);
        this.ghost.plates = this.ghost.plates || [];
        this.ghost.plates.push(plate);
      }
    }

    const material = valid ? this.materials.ghostOk : this.materials.ghostBad;
    const lineMaterial = valid ? this.materials.ghostOkLine : this.materials.ghostBadLine;
    const cellMaterial = valid ? this.materials.ghostOkCell : this.materials.ghostBadCell;
    for (const mesh of this.ghost.meshes) mesh.material = material;
    for (const line of this.ghost.lines) line.material = lineMaterial;
    for (const plate of this.ghost.plates || []) plate.material = cellMaterial;

    const position = gridToWorld(pose.x, pose.y, pose.z);
    this.ghostRoot.position.copy(position);
    this.ghostRoot.visible = true;
  }

  hideGhost() {
    this.ghostRoot.visible = false;
  }

  addPiece(pieceId, orient, pose, { animate = true } = {}) {
    this.removePiece(pieceId, { dispose: true });
    const material = this.materials.pieceMaterials[pieceId % this.materials.pieceMaterials.length];
    const { group } = buildPieceObject(orient, material);
    const position = gridToWorld(pose.x, pose.y, pose.z);
    group.position.copy(position);
    group.userData.pieceId = pieceId;
    group.userData.cells = orient.cells.map(([x, y, z]) => [x + pose.x, y + pose.y, z + pose.z]);
    this.piecesGroup.add(group);
    this.pieces.set(pieceId, group);

    if (animate) {
      group.position.y += 0.9;
      group.scale.setScalar(1.045);
      group.userData.drop = { t: 0, duration: 0.36, fromY: group.position.y, toY: position.y };
    }

    this.refreshVisibility();
    return group;
  }

  removePiece(pieceId, { dispose = true } = {}) {
    const group = this.pieces.get(pieceId);
    if (!group) return;
    this.piecesGroup.remove(group);
    if (dispose) {
      group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
      });
    }
    this.pieces.delete(pieceId);
    this.refreshVisibility();
  }

  clearPieces() {
    for (const pieceId of [...this.pieces.keys()]) this.removePiece(pieceId);
  }

  setIsolation(layer) {
    this.isolation = layer;
    this.refreshVisibility();
  }

  refreshVisibility() {
    for (const group of this.pieces.values()) {
      const cells = group.userData.cells || [];
      group.visible = this.isolation === null || cells.some((cell) => cell[1] === this.isolation);
    }
  }

  setActiveLayer(layer) {
    this.activeLayer = layer;
    this.layerGuide.position.y = layer + 0.012;
    this.materials.layerLine.opacity = layer === 0 ? 0.18 : 0.3;
  }

  setView(name, { immediate = false } = {}) {
    const presets = {
      iso: new THREE.Vector3(11.5, 10.5, 14.5),
      top: new THREE.Vector3(0.4, 20.5, 4.5),
      front: new THREE.Vector3(0, 6, 20),
    };
    const base = this.controls.target.clone();
    const offset = presets[name] || presets.iso;
    const cameraPos = base.clone().add(offset);
    this.controls.autoRotate = false;

    if (immediate) {
      this.camera.position.copy(cameraPos);
      this.controls.update();
      return;
    }

    this.cameraTween = {
      t: 0,
      duration: 0.85,
      fromPos: this.camera.position.clone(),
      toPos: cameraPos,
      fromTarget: this.controls.target.clone(),
      toTarget: base.clone(),
    };
  }

  celebrate() {
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.75;
    this.keyLight.intensity = 3.6;
  }

  resetMood() {
    this.keyLight.intensity = 2.7;
  }

  stopAutoRotate() {
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.35;
  }

  update(dt, time) {
    if (this.cameraTween) {
      const tween = this.cameraTween;
      tween.t = Math.min(1, tween.t + dt / tween.duration);
      const k = tween.t < 0.5
        ? 4 * tween.t ** 3
        : 1 - (-2 * tween.t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
      this.controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
      if (tween.t >= 1) this.cameraTween = null;
    }

    for (const group of this.pieces.values()) {
      const drop = group.userData.drop;
      if (!drop) continue;
      drop.t = Math.min(1, drop.t + dt / drop.duration);
      const k = 1 - (1 - drop.t) ** 3;
      group.position.y = THREE.MathUtils.lerp(drop.fromY, drop.toY, k);
      group.scale.setScalar(THREE.MathUtils.lerp(1.045, 1, k));
      if (drop.t >= 1) {
        group.position.y = drop.toY;
        group.scale.setScalar(1);
        delete group.userData.drop;
      }
    }

    if (this.motes) {
      const positions = this.motes.geometry.attributes.position;
      for (let i = 0; i < positions.count; i += 1) {
        const seed = this.moteSeed[i];
        positions.setY(
          i,
          positions.getY(i) + dt * (0.035 + 0.03 * Math.sin(seed + time * 0.4)),
        );
        positions.setX(i, positions.getX(i) + Math.sin(seed + time * 0.18) * dt * 0.02);
        if (positions.getY(i) > 7.4) positions.setY(i, 0.15);
      }
      positions.needsUpdate = true;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.renderer.dispose();
    this.envTexture.dispose();
  }
}
