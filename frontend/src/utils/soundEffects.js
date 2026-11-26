// Sound Effects Manager – Week Done (Streak-Up) & Week Failed
// Mobile-optimiert: AudioContext wird LAZY beim ersten User-Gesture erzeugt
// (iOS Safari blockt AudioContext-Creation vor jeder Interaktion komplett).

class SoundEffects {
  constructor() {
    this.audioContext = null;
    this.unlocked = false;
    this.readyCallbacks = [];
    // KEIN initAudioContext() hier – iOS würde sonst blockieren.
    this.installUnlockListeners();
  }

  // Context wird beim ersten Klick/Touch erzeugt + entsperrt
  ensureContext() {
    if (this.audioContext) return this.audioContext;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.audioContext = new Ctx();
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
      return null;
    }
    return this.audioContext;
  }

  installUnlockListeners() {
    if (typeof window === 'undefined') return;

    const unlock = () => {
      // 1) Context jetzt (innerhalb des Gesture-Callbacks) erzeugen
      const ctx = this.ensureContext();
      if (!ctx) return;

      // 2) iOS-Trick: KURZER, SYNCHRONER AudioBufferSourceNode mit
      //    leerem Buffer – das ist die zuverlässigste Methode, den
      //    Context auf iOS endgültig zu entsperren.
      try {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        if (typeof source.start === 'function') source.start(0);
        else if (typeof source.noteOn === 'function') source.noteOn(0);
      } catch (e) { /* ignore */ }

      // 3) Resume falls suspended, danach wartende Sounds auslösen
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        ctx.resume().then(() => this.flushReady()).catch(() => {});
      } else {
        this.flushReady();
      }

      if (this.unlocked) return;
      this.unlocked = true;

      // Listener cleanup
      window.removeEventListener('click', unlock, true);
      window.removeEventListener('touchstart', unlock, true);
      window.removeEventListener('touchend', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('pointerdown', unlock, true);
    };

    // passive:false bei touchstart, damit es ggf. synchronen Audio-Trigger zulässt
    window.addEventListener('click', unlock, true);
    window.addEventListener('touchstart', unlock, { capture: true, passive: true });
    window.addEventListener('touchend', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('pointerdown', unlock, true);

    // Bei Tab-Wechsel auf iOS wird der Context oft "interrupted" -
    // beim Zurückkommen direkt wieder aufwecken.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.audioContext &&
          this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(() => this.flushReady()).catch(() => {});
      }
    });
  }

  isReady() {
    return !!this.audioContext && this.audioContext.state === 'running';
  }

  // Führt fn aus, sobald Ton abgespielt werden darf (sofort, wenn schon möglich,
  // sonst beim ersten Antippen/Klicken). So passt der Ton zur Animation.
  whenReady(fn) {
    if (this.isReady()) fn();
    else this.readyCallbacks.push(fn);
  }

  flushReady() {
    const cbs = this.readyCallbacks.splice(0);
    cbs.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
  }

  ensureRunning() {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
      // Resume ist asynchron. Wenn wir true zurückgaeben wuerden, wuerden die
      // Play-Funktionen Oszillatoren auf einem noch suspendierten Context
      // schedulen. Sobald der Context spaeter durch ein User-Gesture
      // (z. B. Klick auf "Fortschritt eintragen") entsperrt wird, wuerden
      // diese nachtraeglich abgespielt -> Geister-Sound beim Klick, obwohl
      // die Woche geschafft war. Daher hier explizit false.
      return false;
    }
    return ctx.state === 'running';
  }

  // 🎮 MODERNER ACHIEVEMENT SOUND - Game Level-Up Style
  playWeekDoneSound() {
    if (!this.ensureRunning()) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    // 1. Bass-Punch
    const kick = ctx.createOscillator();
    const kickGain = ctx.createGain();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(140, now);
    kick.frequency.exponentialRampToValueAtTime(45, now + 0.13);
    kickGain.gain.setValueAtTime(0.0, now);
    kickGain.gain.linearRampToValueAtTime(0.55, now + 0.005);
    kickGain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
    kick.connect(kickGain).connect(master);
    kick.start(now);
    kick.stop(now + 0.2);

    // 2. Rising Sweep
    const sweep = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    const sweepFilter = ctx.createBiquadFilter();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(180, now);
    sweep.frequency.exponentialRampToValueAtTime(1800, now + 0.22);
    sweepFilter.type = 'lowpass';
    sweepFilter.frequency.setValueAtTime(800, now);
    sweepFilter.frequency.exponentialRampToValueAtTime(4000, now + 0.22);
    sweepFilter.Q.value = 6;
    sweepGain.gain.setValueAtTime(0.0, now);
    sweepGain.gain.linearRampToValueAtTime(0.22, now + 0.05);
    sweepGain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
    sweep.connect(sweepFilter).connect(sweepGain).connect(master);
    sweep.start(now);
    sweep.stop(now + 0.3);

    // 3. Major Chord Stab (C5, E5, G5, C6) - Triumph
    const chordStart = now + 0.12;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t0 = chordStart + i * 0.018;
      g.gain.setValueAtTime(0.0, t0);
      g.gain.linearRampToValueAtTime(0.18, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.6);

      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      osc2.type = 'sawtooth';
      osc2.frequency.value = freq;
      filt.type = 'lowpass';
      filt.frequency.value = 2500;
      g2.gain.setValueAtTime(0.0, t0);
      g2.gain.linearRampToValueAtTime(0.06, t0 + 0.012);
      g2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
      osc2.connect(filt).connect(g2).connect(master);
      osc2.start(t0);
      osc2.stop(t0 + 0.5);
    });

    // 4. Sparkle Top
    const sparkleStart = now + 0.25;
    [2093, 2637, 3136, 4186].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = sparkleStart + i * 0.04;
      g.gain.setValueAtTime(0.0, t0);
      g.gain.linearRampToValueAtTime(0.09, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.4);
    });

    // 5. Sub Tail
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(80, now + 0.12);
    sub.frequency.exponentialRampToValueAtTime(55, now + 0.6);
    subGain.gain.setValueAtTime(0.0, now + 0.12);
    subGain.gain.linearRampToValueAtTime(0.25, now + 0.14);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    sub.connect(subGain).connect(master);
    sub.start(now + 0.12);
    sub.stop(now + 0.7);
  }

  // 💀 DRAMATISCHER FAILED SOUND - "Game Over / Try Again" Style
  // Inverses Pendant zum Done-Sound:
  //  1. Crash-Impact (Distortion + Sub-Boom)   - t=0,    direkter Schlag
  //  2. Falling Sweep (Absturz)                - t=0,    Saw fällt
  //  3. Minor Chord Stab (C5, Eb5, G5)         - t=0.08, düster
  //  4. Dark Sub-Drone (Bedrohung)             - t=0,    tiefer Drone
  //  5. Distorted Buzzer Tail (Versagen)       - t=0.45, krachiger Schluss
  playWeekFailedSound() {
    if (!this.ensureRunning()) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);

    // === 1. CRASH IMPACT (Sofortiger Schlag) ==========================
    // Noise-Burst gefiltert + Sub-Boom = "Crash"
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseData.length, 1.5);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilt = ctx.createBiquadFilter();
    noiseFilt.type = 'bandpass';
    noiseFilt.frequency.setValueAtTime(800, now);
    noiseFilt.frequency.exponentialRampToValueAtTime(150, now + 0.25);
    noiseFilt.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0, now);
    noiseGain.gain.linearRampToValueAtTime(0.35, now + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    noise.connect(noiseFilt).connect(noiseGain).connect(master);
    noise.start(now);
    noise.stop(now + 0.3);

    // Sub-Boom (tiefer Aufprall)
    const boom = ctx.createOscillator();
    const boomGain = ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(110, now);
    boom.frequency.exponentialRampToValueAtTime(35, now + 0.2);
    boomGain.gain.setValueAtTime(0.0, now);
    boomGain.gain.linearRampToValueAtTime(0.6, now + 0.005);
    boomGain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
    boom.connect(boomGain).connect(master);
    boom.start(now);
    boom.stop(now + 0.3);

    // === 2. FALLING SWEEP (Absturz, gespiegelt zum Done-Sweep) ========
    const sweep = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    const sweepFilter = ctx.createBiquadFilter();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(1200, now);
    sweep.frequency.exponentialRampToValueAtTime(120, now + 0.5);
    sweepFilter.type = 'lowpass';
    sweepFilter.frequency.setValueAtTime(3500, now);
    sweepFilter.frequency.exponentialRampToValueAtTime(500, now + 0.5);
    sweepFilter.Q.value = 8;
    sweepGain.gain.setValueAtTime(0.0, now);
    sweepGain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    sweepGain.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
    sweep.connect(sweepFilter).connect(sweepGain).connect(master);
    sweep.start(now);
    sweep.stop(now + 0.6);

    // === 3. MINOR CHORD STAB (C5, Eb5, G5) - Düstere Harmonie =========
    const chordStart = now + 0.08;
    [523.25, 622.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      // Leichtes Detune nach unten = "krank" / "schief"
      osc.detune.value = -8;
      const t0 = chordStart + i * 0.025;
      g.gain.setValueAtTime(0.0, t0);
      g.gain.linearRampToValueAtTime(0.16, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.75);

      // Saw-Layer für mehr Aggression
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      osc2.type = 'sawtooth';
      osc2.frequency.value = freq;
      osc2.detune.value = -8;
      filt.type = 'lowpass';
      filt.frequency.value = 1500;
      g2.gain.setValueAtTime(0.0, t0);
      g2.gain.linearRampToValueAtTime(0.07, t0 + 0.015);
      g2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
      osc2.connect(filt).connect(g2).connect(master);
      osc2.start(t0);
      osc2.stop(t0 + 0.6);
    });

    // === 4. DARK SUB-DRONE (Bedrohliche Wärme) ========================
    const drone = ctx.createOscillator();
    const droneGain = ctx.createGain();
    drone.type = 'sine';
    drone.frequency.setValueAtTime(65, now);
    drone.frequency.exponentialRampToValueAtTime(40, now + 0.9);
    droneGain.gain.setValueAtTime(0.0, now);
    droneGain.gain.linearRampToValueAtTime(0.3, now + 0.05);
    droneGain.gain.linearRampToValueAtTime(0.18, now + 0.5);
    droneGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    drone.connect(droneGain).connect(master);
    drone.start(now);
    drone.stop(now + 1.05);

    // === 5. DISTORTED BUZZER TAIL (Krachiger Schluss) =================
    const buzzer = ctx.createOscillator();
    const buzzerGain = ctx.createGain();
    const buzzerFilt = ctx.createBiquadFilter();
    buzzer.type = 'square';
    buzzer.frequency.setValueAtTime(95, now + 0.45);
    buzzer.frequency.linearRampToValueAtTime(70, now + 0.95);
    buzzerFilt.type = 'lowpass';
    buzzerFilt.frequency.value = 1200;
    buzzerFilt.Q.value = 3;
    buzzerGain.gain.setValueAtTime(0.0, now + 0.45);
    buzzerGain.gain.linearRampToValueAtTime(0.22, now + 0.48);
    buzzerGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    buzzer.connect(buzzerFilt).connect(buzzerGain).connect(master);
    buzzer.start(now + 0.45);
    buzzer.stop(now + 1.05);
  }
}

// Singleton
const soundEffects = new SoundEffects();

// SESSION-Tracking für Failed (1× pro Woche)
const SOUND_STORAGE_KEY = 'tracker_sound_played_session';

function getSoundPlayedData() {
  try {
    const data = sessionStorage.getItem(SOUND_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    console.warn('Failed to read sound tracking data:', e);
    return {};
  }
}

function setSoundPlayedData(data) {
  try {
    sessionStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save sound tracking data:', e);
  }
}

export function shouldPlayWeekFailedSound(userId, weekNumber) {
  const key = `failed_${userId}_${weekNumber}`;
  const data = getSoundPlayedData();
  return !data[key];
}

export function markWeekFailedSoundPlayed(userId, weekNumber) {
  const key = `failed_${userId}_${weekNumber}`;
  const data = getSoundPlayedData();
  data[key] = Date.now();
  setSoundPlayedData(data);
}

export function playWeekDoneSound() {
  soundEffects.playWeekDoneSound();
}

export function playWeekFailedSound() {
  soundEffects.playWeekFailedSound();
}

export function whenAudioReady(fn) {
  soundEffects.whenReady(fn);
}

// ── Herausforderung (Ready-Check, Dean 2026-11-26) ───────────────────────
// Eigene Sounds (keine fremden Aufnahmen): erzeugt mit Web Audio.
function voice(ctx, out, { type = "sine", f0, f1, t0, dur, vol, attack = 0.01 }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur * 0.6);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// Klangwelt (Dean 2026-11-26, nach Vorbild „tief, warm, lang ausklingend“, aber eigene Töne):
// weicher, dumpfer Schlag + zwei warme, leicht schwebende Töne. Bewusst leise (dezent auch bei voller Lautstärke).
function softNoise(ctx, out, t0, dur, vol, fFrom, fTo, type = "lowpass") {
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(fFrom, t0);
  f.frequency.exponentialRampToValueAtTime(fTo, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + dur);
}
function bell(ctx, out, f, t0, dur, vol, attack = 0.02) {
  // zwei leicht verstimmte Sinus-Töne = sanftes Schweben
  [0, 2.5].forEach((det) => voice(ctx, out, { type: "sine", f0: f + det, t0, dur, vol: vol / 2, attack }));
  voice(ctx, out, { type: "sine", f0: f * 2.01, t0, dur: dur * 0.4, vol: vol * 0.12, attack });
}

// Tiefe Trommel (Taiko-artig): Sinus-Bauch + gedämpftes Rauschen für das Fell
function drum(ctx, out, t0, vol, pitch = 92) {
  voice(ctx, out, { f0: pitch, f1: pitch * 0.6, t0, dur: 0.7, vol: vol * 0.8, attack: 0.004 });
  voice(ctx, out, { type: "triangle", f0: pitch * 2.1, f1: pitch * 1.3, t0, dur: 0.35, vol: vol * 0.45, attack: 0.003 });
  voice(ctx, out, { type: "sine", f0: pitch * 3.6, f1: pitch * 2.4, t0, dur: 0.18, vol: vol * 0.18, attack: 0.002 });
  softNoise(ctx, out, t0, 0.22, vol * 0.5, 2600, 300);
}
// gehaltener Ton mit langsamem Ein-/Ausblenden (Fläche)
function pad(ctx, out, f, t0, dur, vol) {
  [0, 1.8].forEach((det) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f + det, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol / 2, t0 + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  });
}

// Herausforderung: Schleife für die ganze Annahme-Phase (Dean 2026-11-26). Klangwelt wie das Vorbild
// (tiefe Trommeln, Brummen, warme Töne in D), eigener Rhythmus. setUrgent(true) = letzte Sekunden dichter.
// Bewusst leise gemischt. Rückgabe: { stop(), setUrgent(bool) }.
const LOOP_S = 3.2;
const NOTE = { D2: 73.42, A2: 110, D3: 146.83, G3: 196, A3: 220, D4: 293.66, F4: 349.23, A4: 440, D5: 587.33, F5: 698.46 };
function challengeBar(ctx, out, t, n, urgent) {
  // Trommeln: Schlag – Nachschlag … Doppel – (leise)
  drum(ctx, out, t, 0.55);
  drum(ctx, out, t + 0.34, 0.32, 84);
  drum(ctx, out, t + 1.2, 0.45);
  drum(ctx, out, t + 1.42, 0.3, 80);
  drum(ctx, out, t + 2.3, 0.22, 76);
  if (urgent) [0.8, 1.8, 2.6, 2.95].forEach((d) => drum(ctx, out, t + d, 0.22, 100));
  // Brummen + Fläche: abwechselnd D und G
  pad(ctx, out, NOTE.D2, t, LOOP_S + 0.4, 0.1);
  pad(ctx, out, n % 2 ? NOTE.G3 : NOTE.D3, t + 0.1, LOOP_S, 0.07);
  pad(ctx, out, NOTE.A3, t + 0.2, LOOP_S, 0.04);
  // warme Glocken-Töne oben, jeder zweite Takt
  if (n % 2 === 0) {
    bell(ctx, out, NOTE.D4, t + 0.02, 2.2, 0.18, 0.03);
    bell(ctx, out, NOTE.F5, t + 0.05, 1.8, 0.3, 0.05);
    bell(ctx, out, 1174.66, t + 0.06, 1.2, 0.12, 0.05); // Glanz oben
  } else {
    bell(ctx, out, NOTE.A3, t + 1.2, 1.8, 0.1, 0.03);
    bell(ctx, out, NOTE.D5, t + 1.22, 1.5, 0.24, 0.04);
    bell(ctx, out, 1396.91, t + 1.25, 0.9, 0.08, 0.05);
  }
  if (urgent) bell(ctx, out, NOTE.D5, t + 2.6, 0.5, 0.05, 0.01);
}

function synthChallengeLoop() {
  if (!soundEffects.ensureRunning()) return { stop() {}, setUrgent() {} };
  const ctx = soundEffects.audioContext;
  const out = ctx.createGain();
  out.gain.value = 0.5;
  out.connect(ctx.destination);
  let urgent = false;
  let n = 0;
  let next = ctx.currentTime + 0.05;
  const plan = () => {
    while (next < ctx.currentTime + 0.6) {
      challengeBar(ctx, out, next, n, urgent);
      next += urgent ? LOOP_S * 0.85 : LOOP_S;
      n += 1;
    }
  };
  plan();
  const iv = window.setInterval(plan, 150);
  return {
    setUrgent(v) { urgent = !!v; },
    stop() {
      window.clearInterval(iv);
      try {
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.08); // kurz ausblenden
        window.setTimeout(() => { try { out.disconnect(); } catch { /* egal */ } }, 800);
      } catch { /* egal */ }
    },
  };
}

// Für Hörproben: Schleife für `seconds` vorab einplanen (z. B. OfflineAudioContext)
export function renderChallengeLoop(ctx, seconds, urgentFrom = Infinity) {
  const out = ctx.createGain();
  out.gain.value = 0.5;
  out.connect(ctx.destination);
  let t = 0.05;
  for (let n = 0; t < seconds; n++) {
    const urgent = t >= urgentFrom;
    challengeBar(ctx, out, t, n, urgent);
    t += urgent ? LOOP_S * 0.85 : LOOP_S;
  }
}

// Kurzer Einzel-Sound beim Erscheinen (für Stellen ohne Schleife)
export function playChallengePop() {
  const loop = startChallengeLoop();
  window.setTimeout(() => loop.stop(), LOOP_S * 1000);
}

// Angenommen: tiefer Schlag + warmer Ton D4 mit Quinte, kurz
function synthChallengeAccept() {
  if (!soundEffects.ensureRunning()) return;
  const ctx = soundEffects.audioContext;
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0.15; // dezent
  out.connect(ctx.destination);
  voice(ctx, out, { f0: 64, f1: 44, t0: now, dur: 0.9, vol: 1.1, attack: 0.004 }); // tiefer Schlag
  voice(ctx, out, { type: "triangle", f0: 130, f1: 90, t0: now, dur: 0.3, vol: 0.25, attack: 0.003 });
  softNoise(ctx, out, now, 0.28, 1.6, 3200, 7500, "highpass"); // heller Anschlag
  bell(ctx, out, NOTE.D4, now + 0.01, 1.3, 0.3, 0.01);
  bell(ctx, out, NOTE.A4, now + 0.1, 1.1, 0.1, 0.01);
}

// Abgelehnt/verpasst: gedämpfter Schlag + Ton nach unten
function synthChallengeDecline() {
  if (!soundEffects.ensureRunning()) return;
  const ctx = soundEffects.audioContext;
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0.5;
  out.connect(ctx.destination);
  drum(ctx, out, now, 0.45, 76);
  voice(ctx, out, { type: "sine", f0: NOTE.D4, f1: NOTE.A3, t0: now + 0.02, dur: 0.9, vol: 0.12, attack: 0.02 });
  voice(ctx, out, { type: "sine", f0: NOTE.A3, f1: NOTE.D3, t0: now + 0.15, dur: 1.0, vol: 0.08, attack: 0.03 });
}

// ── Herausforderung mit den Sounds von Deans Kumpel (public/sounds/, Dean 2026-11-26) ─────
// Einmal laden + dekodieren; fehlen sie (offline, alter Cache), springen die erzeugten Sounds ein.
// hum = nur das tiefe Brummen als nahtlose Schleife (WAV, damit beim Wiederholen keine Lücke entsteht)
const SFX = { pop: "/sounds/challenge-hum.wav", accept: "/sounds/challenge-accept.mp3", decline: "/sounds/challenge-decline.mp3" };
const sfxBuffers = {};
let sfxLoading = null;
export function preloadChallengeSounds() {
  if (sfxLoading) return sfxLoading;
  // Stiller Hilfs-Kontext nur zum Dekodieren: der echte Audio-Kontext entsteht erst beim ersten Antippen (iOS)
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = Off ? new Off(1, 1, 44100) : null;
  if (!ctx || typeof fetch !== "function") return Promise.resolve();
  sfxLoading = Promise.all(Object.entries(SFX).map(async ([k, url]) => {
    try {
      const data = await (await fetch(url)).arrayBuffer();
      sfxBuffers[k] = await new Promise((res, rej) => {
        const p = ctx.decodeAudioData(data, res, rej); // Safari kennt nur die Rückruf-Form
        if (p && p.catch) p.catch(rej);
      });
    } catch { /* dann eben der erzeugte Sound */ }
  }));
  return sfxLoading;
}
function playBuffer(ctx, buf, out, t) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(out);
  src.start(t);
  return src;
}

// Läuft die ganze Annahme-Phase: tiefes Brummen als Endlos-Schleife. Rückgabe { stop(), setUrgent() }.
export function startChallengeLoop() {
  if (!sfxBuffers.pop) {
    // Datei noch nicht da: kurz warten (max. 1,5 s) statt die ganze Phase den Ersatz-Sound zu spielen
    let inner = null;
    let stopped = false;
    const ready = preloadChallengeSounds();
    const fallback = window.setTimeout(() => { if (!stopped && !inner) inner = synthChallengeLoop(); }, 1500);
    ready.then(() => {
      if (stopped || inner) return;
      window.clearTimeout(fallback);
      inner = sfxBuffers.pop ? startChallengeLoop() : synthChallengeLoop();
    });
    return {
      setUrgent(v) { inner?.setUrgent(v); },
      stop() { stopped = true; window.clearTimeout(fallback); inner?.stop(); },
    };
  }
  const buf = sfxBuffers.pop;
  if (!soundEffects.ensureRunning()) return { stop() {}, setUrgent() {} };
  const ctx = soundEffects.audioContext;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.25); // sanft einblenden
  out.connect(ctx.destination);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true; // Endlos-Schleife ohne Lücke, bis Annehmen/Ablehnen/Ablauf
  src.connect(out);
  src.start();
  return {
    setUrgent() { /* bleibt gleichmäßig */ },
    // weich ausblenden (~0,5 s), damit Annehmen/Ablehnen nahtlos daran anschließt
    stop(fade = 0.16) {
      try {
        const now = ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.setTargetAtTime(0, now, fade);
        window.setTimeout(() => { try { src.stop(); out.disconnect(); } catch { /* egal */ } }, fade * 6000 + 200);
      } catch { /* egal */ }
    },
  };
}

export function playChallengeAccept() {
  if (!sfxBuffers.accept) return synthChallengeAccept();
  if (!soundEffects.ensureRunning()) return;
  const ctx = soundEffects.audioContext;
  playBuffer(ctx, sfxBuffers.accept, ctx.destination, ctx.currentTime + 0.06);
}

export function playChallengeDecline() {
  if (!sfxBuffers.decline) return synthChallengeDecline();
  if (!soundEffects.ensureRunning()) return;
  const ctx = soundEffects.audioContext;
  playBuffer(ctx, sfxBuffers.decline, ctx.destination, ctx.currentTime + 0.06);
}
