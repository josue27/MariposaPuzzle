import * as THREE from 'three';

/** Generador pseudoaleatorio determinista (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Veta de madera dibujada a mano: líneas onduladas, nudos y ruido fino.
 * Se usa en gris claro para poder teñirla con el color de cada pieza.
 */
export function woodTexture({
  base = '#d8cec0',
  dark = '#8d7560',
  light = '#f0e7da',
  planks = false,
  seed = 7,
  strength = 1,
} = {}) {
  return canvasTexture(512, (ctx, size) => {
    const rand = rng(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    if (planks) {
      const rows = 4;
      const h = size / rows;
      for (let i = 0; i < rows; i += 1) {
        ctx.fillStyle = `rgba(${60 + rand() * 30}, ${40 + rand() * 22}, ${26 + rand() * 14}, 0.22)`;
        ctx.fillRect(0, i * h, size, h);
        ctx.strokeStyle = 'rgba(8,5,3,0.55)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, i * h + 0.5);
        ctx.lineTo(size, i * h + 0.5);
        ctx.stroke();
      }
    }

    // Vetas largas
    const lines = 120;
    for (let i = 0; i < lines; i += 1) {
      const y0 = rand() * size;
      const amp = 2 + rand() * 12;
      const freq = 0.004 + rand() * 0.012;
      const phase = rand() * Math.PI * 2;
      const alpha = (0.03 + rand() * 0.11) * strength;
      const lighter = rand() > 0.72;
      ctx.strokeStyle = lighter
        ? `rgba(255, 248, 235, ${alpha * 0.9})`
        : `rgba(74, 51, 34, ${Math.min(0.4, alpha)})`;
      ctx.lineWidth = 0.5 + rand() * 2.4;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 6) {
        const drift = Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase * 2) * amp * 0.22;
        const y = y0 + drift;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Nudos
    for (let k = 0; k < 4; k += 1) {
      const cx = rand() * size;
      const cy = rand() * size;
      const rx = 8 + rand() * 16;
      const ry = 3 + rand() * 6;
      for (let ring = 0; ring < 4; ring += 1) {
        ctx.strokeStyle = `rgba(66, 44, 28, ${0.08 + rand() * 0.08})`;
        ctx.lineWidth = 0.6 + rand();
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx + ring * 4, ry + ring * 2.2, rand() * 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Ruido fino para que no se vea plano
    const image = ctx.getImageData(0, 0, size, size);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (rand() - 0.5) * 12;
      data[i] += n;
      data[i + 1] += n;
      data[i + 2] += n;
    }
    ctx.putImageData(image, 0, 0);

    // Degradado suave para dar profundidad
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, 'rgba(255,255,255,0.08)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(40,24,12,0.12)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
}

/** Sombra de contacto suave. */
export function contactShadowTexture() {
  return canvasTexture(256, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.78)');
    g.addColorStop(0.38, 'rgba(0,0,0,0.45)');
    g.addColorStop(0.72, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** Halo cálido para el charco de luz de la mesa. */
export function lightPoolTexture() {
  return canvasTexture(256, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,196,120,0.85)');
    g.addColorStop(0.45, 'rgba(255,160,80,0.28)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** Punto suave para las motas de polvo. */
export function sparkTexture() {
  return canvasTexture(64, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,245,220,1)');
    g.addColorStop(0.35, 'rgba(255,210,150,0.5)');
    g.addColorStop(1, 'rgba(255,180,100,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** Placa de latón grabada para la base del cubo. */
export function plaqueTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 1024, 192);
  g.addColorStop(0, '#b98d4f');
  g.addColorStop(0.35, '#e2c189');
  g.addColorStop(0.55, '#caa160');
  g.addColorStop(1, '#8f6836');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 192);

  ctx.strokeStyle = 'rgba(52,34,12,0.65)';
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 14, 996, 164);

  ctx.fillStyle = 'rgba(49,31,12,0.9)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 74px Georgia, "Times New Roman", serif';
  ctx.letterSpacing = '14px';
  ctx.fillText('MARIPOSA', 512, 82);
  ctx.font = '400 30px "Segoe UI", system-ui, sans-serif';
  ctx.letterSpacing = '8px';
  ctx.fillStyle = 'rgba(55,36,14,0.75)';
  ctx.fillText('5 × 5 × 5', 512, 142);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
