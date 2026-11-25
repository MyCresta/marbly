const ROLL = {
  metal: { type: 'bandpass', base: 2400, span: 1800, q: 1.6, gain: 0.32 },
  glass: { type: 'bandpass', base: 1500, span: 1300, q: 1.2, gain: 0.3 },
  plastic: { type: 'bandpass', base: 900, span: 700, q: 0.9, gain: 0.26 },
  wood: { type: 'lowpass', base: 300, span: 420, q: 1.1, gain: 0.42 },
  rubber: { type: 'lowpass', base: 160, span: 200, q: 0.7, gain: 0.22 },
};

const MALLET = {
  metal: { bright: 1, click: 5200, clickGain: 0.5, decay: 1.2, level: 1 },
  glass: { bright: 0.85, click: 4200, clickGain: 0.45, decay: 1.1, level: 0.9 },
  plastic: { bright: 0.45, click: 2200, clickGain: 0.3, decay: 0.9, level: 0.7 },
  wood: { bright: 0.25, click: 1100, clickGain: 0.55, decay: 0.7, level: 0.6 },
  rubber: { bright: 0.05, click: 380, clickGain: 0.4, decay: 0.35, level: 0.35 },
};

export function voiceKind(typeId) {
  return (VOICES[typeId] || VOICES.catseye).kind;
}

const VOICES = {
  catseye: { kind: 'glass', pitch: 3100 },
  aurora: { kind: 'glass', pitch: 2800 },
  acrylic: { kind: 'plastic', pitch: 1500 },
  oak: { kind: 'wood', pitch: 820 },
  rubber: { kind: 'rubber', pitch: 260 },
  steel: { kind: 'metal', pitch: 4200 },
  brass: { kind: 'metal', pitch: 3300 },
  copper: { kind: 'metal', pitch: 2900 },
  tungsten: { kind: 'metal', pitch: 2400 },
};

export class SoundBoard {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lastClick = 0;
    this.clicksThisFrame = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.8 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(1.4);
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.18;
    this.verb.connect(verbGain).connect(this.master);

    const len = ctx.sampleRate * 2;
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = nb.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = 0.985 * b + 0.015 * (Math.random() * 2 - 1);
      data[i] = b * 6 + (Math.random() * 2 - 1) * 0.08;
    }
    this.noiseBuffer = nb;

    this.rolls = {};
    for (const [kind, r] of Object.entries(ROLL)) this.rolls[kind] = this.loopNoise(r.base, r.q, r.type);
    this.whirr = this.loopNoise(1400, 3, 'bandpass');
    this.fanNoise = this.loopNoise(500, 0.6, 'lowpass');
    const hum = ctx.createOscillator();
    hum.frequency.value = 118;
    hum.type = 'triangle';
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    hum.connect(this.humGain).connect(this.master);
    hum.start();
  }

  impulse(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  loopNoise(freq, q, type) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    return { filter, gain };
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  frame() {
    this.clicksThisFrame = 0;
  }

  impact(typeId, strength, pan = 0, distance = 1, surface = 'wood') {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    if (this.clicksThisFrame > 5) return;
    const s = Math.min(1, strength);
    if (s < 0.02) return;
    this.clicksThisFrame++;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.002;
    const voice = VOICES[typeId] || VOICES.catseye;
    const vol = Math.min(0.9, s * 0.9) / (0.6 + distance * 0.9);
    const out = ctx.createGain();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(panner).connect(this.master);
      panner.connect(this.verb);
    } else {
      out.connect(this.master);
    }
    out.gain.value = vol;
    const ring = voice.kind === 'metal' || voice.kind === 'glass';
    const surfaceDamp = surface === 'felt' ? 0.25 : surface === 'copper' ? 1.4 : 1;
    if (ring && surface !== 'felt') {
      const ratios = voice.kind === 'metal' ? [1, 2.76, 5.4, 8.9] : [1, 2.32, 4.25, 6.63];
      const decay = (voice.kind === 'metal' ? 0.22 : 0.12) * surfaceDamp;
      ratios.forEach((r, i) => {
        if (voice.pitch * r > ctx.sampleRate * 0.4) return;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = voice.pitch * r * (0.97 + Math.random() * 0.06);
        const g = ctx.createGain();
        const a = (0.5 / (i + 1)) * (i === 0 ? 1 : 0.6);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(a, t + 0.001);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay / (1 + i * 0.6));
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + decay + 0.05);
      });
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    const tonal = surface === 'felt' ? 380 : voice.kind === 'rubber' ? 220 : voice.kind === 'wood' ? 900 : 1800;
    f.frequency.value = tonal * (0.9 + Math.random() * 0.2);
    f.Q.value = surface === 'felt' ? 0.8 : 1.6;
    const g = ctx.createGain();
    const len = surface === 'felt' ? 0.05 : voice.kind === 'rubber' ? 0.06 : 0.035;
    g.gain.setValueAtTime(ring ? 0.5 : 1.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5, len + 0.02);
  }

  bumper(pan = 0, distance = 1) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.002;
    const out = ctx.createGain();
    out.gain.value = 0.32 / (0.6 + distance * 0.8);
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(panner).connect(this.master);
      panner.connect(this.verb);
    } else {
      out.connect(this.master);
    }
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1050, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.7, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.2);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 260;
    f.Q.value = 1.2;
    const n = ctx.createGain();
    n.gain.setValueAtTime(1.4, t);
    n.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(n).connect(out);
    src.start(t, Math.random() * 1.5, 0.07);
  }

  tick(distance) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.002;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3200;
    f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05 / (0.5 + distance), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random(), 0.04);
  }

  note(freq, strength, pan = 0, distance = 1, typeId = 'steel', mass = 0.03) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.002;
    const mallet = MALLET[voiceKind(typeId)];
    const weight = Math.min(1.3, 0.55 + Math.sqrt(mass / 0.03) * 0.45);
    const out = ctx.createGain();
    out.gain.value = Math.min(0.55, (0.1 + strength * 0.35) * mallet.level * weight) / (0.6 + distance * 0.7);
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(panner).connect(this.master);
      panner.connect(this.verb);
    } else {
      out.connect(this.master);
    }
    const b = mallet.bright;
    [[1, 1, 1.1], [2.76, 0.32 * b, 0.35], [5.4, 0.16 * b * b, 0.15], [4, 0.06 * b, 0.3]].forEach(([ratio, amp, decay]) => {
      const f = freq * ratio;
      if (f > ctx.sampleRate * 0.4 || amp < 0.004) return;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      const d = decay * mallet.decay;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + (b < 0.2 ? 0.006 : 0.002));
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + d + 0.05);
    });
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = mallet.click;
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(mallet.clickGain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5, 0.04);
  }

  ambient({ rolling = {}, funnel = 0, fan = 0, fanDistance = 1 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [kind, r] of Object.entries(ROLL)) {
      const voice = this.rolls[kind];
      const st = rolling[kind] || { amount: 0, speed: 0 };
      voice.gain.gain.setTargetAtTime(Math.min(0.55, st.amount * r.gain), t, 0.06);
      voice.filter.frequency.setTargetAtTime(r.base + Math.min(1.5, st.speed) * r.span, t, 0.1);
    }
    this.whirr.gain.gain.setTargetAtTime(Math.min(0.12, funnel * 0.06), t, 0.08);
    this.whirr.filter.frequency.setTargetAtTime(900 + funnel * 900, t, 0.1);
    const fv = fan / (0.5 + fanDistance);
    this.fanNoise.gain.gain.setTargetAtTime(fv * 0.1, t, 0.2);
    this.humGain.gain.setTargetAtTime(fv * 0.012, t, 0.2);
  }
}
