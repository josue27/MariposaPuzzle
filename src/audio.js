/** Sonidos sintetizados: golpes de madera y un acorde final. */
export class Sfx {
  constructor() {
    this.enabled = true;
    try {
      this.enabled = localStorage.getItem('mariposa.sound') !== 'off';
    } catch {
      this.enabled = true;
    }
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
  }

  unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    try {
      localStorage.setItem('mariposa.sound', enabled ? 'on' : 'off');
    } catch {
      /* sin almacenamiento */
    }
    if (enabled) {
      this.unlock();
      this.rotate();
    }
  }

  getNoise() {
    if (!this.ctx) return null;
    if (!this.noiseBuffer) {
      const length = Math.floor(this.ctx.sampleRate * 0.08);
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  tone({ freq = 220, endFreq = null, duration = 0.08, gain = 0.12, type = 'sine', delay = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const start = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  click({ gain = 0.05, freq = 1100 } = {}) {
    if (!this.enabled || !this.ctx) return;
    const noise = this.getNoise();
    const source = this.ctx.createBufferSource();
    source.buffer = noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 1.2;
    const env = this.ctx.createGain();
    const start = this.ctx.currentTime;
    env.gain.setValueAtTime(gain, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 0.045);
    source.connect(filter).connect(env).connect(this.master);
    source.start(start);
    source.stop(start + 0.06);
  }

  place() {
    this.unlock();
    this.tone({ freq: 168, endFreq: 92, duration: 0.14, gain: 0.2, type: 'triangle' });
    this.click({ gain: 0.06, freq: 780 });
  }

  pick() {
    this.unlock();
    this.tone({ freq: 330, endFreq: 250, duration: 0.06, gain: 0.07, type: 'sine' });
    this.click({ gain: 0.025, freq: 1400 });
  }

  rotate() {
    this.unlock();
    this.tone({ freq: 520, endFreq: 430, duration: 0.04, gain: 0.035, type: 'sine' });
  }

  invalid() {
    this.unlock();
    this.tone({ freq: 150, endFreq: 120, duration: 0.1, gain: 0.06, type: 'sawtooth' });
  }

  tick() {
    this.tone({ freq: 640, endFreq: 600, duration: 0.03, gain: 0.025, type: 'sine' });
  }

  win() {
    this.unlock();
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, index) => {
      this.tone({
        freq,
        duration: 0.6,
        gain: 0.075,
        type: 'sine',
        delay: 0.1 + index * 0.1,
      });
      this.tone({
        freq: freq / 2,
        duration: 0.5,
        gain: 0.025,
        type: 'triangle',
        delay: 0.1 + index * 0.1,
      });
    });
  }
}
