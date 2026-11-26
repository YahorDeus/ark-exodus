// audio.js — процедурный Web Audio: звуковые эффекты + адаптивный космический саундтрек (FTL / Stellaris стиль)

// Аккордовая прогрессия в Ре миноре (Dm9 -> Bbmaj7 -> Fmaj7 -> Am7/A7) — атмосферный космос
const CHORD_PROGRESSION = [
  { bass: 73.42,  pad: [146.83, 220.00, 261.63, 329.63], arp: [293.66, 349.23, 440.00, 523.25, 659.25] }, // Dm9
  { bass: 58.27,  pad: [116.54, 174.61, 220.00, 293.66], arp: [233.08, 293.66, 349.23, 440.00, 587.33] }, // Bbmaj7
  { bass: 87.31,  pad: [174.61, 220.00, 261.63, 329.63], arp: [261.63, 329.63, 349.23, 440.00, 523.25] }, // Fmaj7
  { bass: 55.00,  pad: [110.00, 164.81, 220.00, 261.63], arp: [220.00, 261.63, 329.63, 392.00, 440.00] }  // Am7
];

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;      // SFX
    this.musicEnabled = true; // Фоновая музыка
    this.musicStarted = false;
    this.tension = false;     // Адаптивный режим (Захват Звезды / Угроза / Блэкаут)

    this.musicMaster = null;
    this.delayNode = null;
    this.delayFeedback = null;

    this.stepIndex = 0;
    this.chordIndex = 0;
    this.schedulerId = null;
  }

  setEnabled(v) {
    this.enabled = !!v;
  }

  setMusicEnabled(v) {
    this.musicEnabled = !!v;
    if (this.musicMaster && this.ctx) {
      const now = this.ctx.currentTime;
      this.musicMaster.gain.cancelScheduledValues(now);
      this.musicMaster.gain.setTargetAtTime(this.musicEnabled ? 0.24 : 0.0001, now, 0.25);
    }
    if (this.musicEnabled && !this.musicStarted) {
      this.startMusic();
    }
  }

  setTension(isTense) {
    this.tension = !!isTense;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.initMusicBus();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  initMusicBus() {
    if (!this.ctx || this.musicMaster) return;
    const ctx = this.ctx;

    this.musicMaster = ctx.createGain();
    this.musicMaster.gain.value = this.musicEnabled ? 0.24 : 0.0001;

    // Космический дилей (стерео-эхо) для объёма и глубины
    this.delayNode = ctx.createDelay(1.2);
    this.delayNode.delayTime.value = 0.44;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.38;

    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 1600;

    this.delayNode.connect(delayFilter);
    delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    delayFilter.connect(this.musicMaster);

    this.musicMaster.connect(ctx.destination);
  }

  startMusic() {
    const ctx = this.ensure();
    if (!ctx || this.musicStarted) return;
    this.musicStarted = true;

    // Запускаем первый пэд сразу, затем шаговый секвенсор каждые 650 мс (~92 BPM восьмыми/четвертями)
    this.playPadChord(CHORD_PROGRESSION[0]);
    this.schedulerId = window.setInterval(() => {
      if (!this.musicEnabled || !this.ctx || this.ctx.state !== 'running') return;
      this.musicTick();
    }, 620);
  }

  musicTick() {
    const chord = CHORD_PROGRESSION[this.chordIndex];

    // Каждые 12 тиков (~7.4 сек) плавно меняем космический аккорд
    if (this.stepIndex % 12 === 0 && this.stepIndex > 0) {
      this.chordIndex = (this.chordIndex + 1) % CHORD_PROGRESSION.length;
      this.playPadChord(CHORD_PROGRESSION[this.chordIndex]);
    }

    const curChord = CHORD_PROGRESSION[this.chordIndex];

    // Кристальные космические ноты арпеджио (прозрачно, с паузами, чтобы не надоедало)
    const arpPattern = [0, -1, 2, 1, -1, 4, 2, -1, 3, 1, -1, 2];
    const noteIdx = arpPattern[this.stepIndex % arpPattern.length];
    if (noteIdx >= 0) {
      const freq = curChord.arp[noteIdx % curChord.arp.length];
      // В спокойном режиме иногда пропускаем ноту для «дыхания» космоса
      if (this.tension || Math.random() < 0.78) {
        this.playArpPluck(freq, this.tension ? 0.14 : 0.10);
      }
    }

    // Глубокий бас-пульс (усиливается в режиме напряжения: Захват Звезды / Десант / Блэкаут!)
    if (this.tension) {
      if (this.stepIndex % 2 === 0) {
        this.playBassPulse(curChord.bass, 0.24, 0.42);
      }
      if (this.stepIndex % 4 === 2) {
        this.playBassPulse(curChord.bass * 1.5, 0.12, 0.28);
      }
    } else if (this.stepIndex % 6 === 0) {
      this.playBassPulse(curChord.bass, 0.14, 1.4);
    }

    this.stepIndex += 1;
  }

  playPadChord(chord) {
    if (!this.ctx || !this.musicMaster) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = 7.8;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.tension ? 620 : 420, now);
    filter.frequency.linearRampToValueAtTime(this.tension ? 980 : 680, now + dur * 0.5);
    filter.frequency.linearRampToValueAtTime(380, now + dur);

    const chordGain = ctx.createGain();
    chordGain.gain.setValueAtTime(0.0001, now);
    chordGain.gain.linearRampToValueAtTime(0.14, now + 1.8);
    chordGain.gain.setValueAtTime(0.12, now + dur - 2.0);
    chordGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    filter.connect(chordGain);
    chordGain.connect(this.musicMaster);

    chord.pad.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime((idx - 1.5) * 4.5, now); // тёплый аналоговый хорус
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    });
  }

  playArpPluck(freq, vol) {
    if (!this.ctx || !this.musicMaster || !this.delayNode) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const flt = ctx.createBiquadFilter();

    osc.type = this.tension ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, now);

    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(2200, now);
    flt.frequency.exponentialRampToValueAtTime(650, now + 0.9);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);

    osc.connect(flt);
    flt.connect(g);
    g.connect(this.musicMaster);
    g.connect(this.delayNode); // отправляем в космическое эхо!

    osc.start(now);
    osc.stop(now + 1.2);
  }

  playBassPulse(freq, vol, dur) {
    if (!this.ctx || !this.musicMaster) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const flt = ctx.createBiquadFilter();
    const g = ctx.createGain();

    osc.type = this.tension ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(freq, now);

    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(this.tension ? 260 : 180, now);
    flt.frequency.exponentialRampToValueAtTime(85, now + dur);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(flt);
    flt.connect(g);
    g.connect(this.musicMaster);

    osc.start(now);
    osc.stop(now + dur + 0.04);
  }

  // ===== ЗВУКОВЫЕ ЭФФЕКТЫ (SFX) =====

  tone(freq, dur, type = 'sine', vol = 0.09, delay = 0, slideTo = null) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  playClick() { this.tone(520, 0.06, 'sine', 0.06, 0, 620); }
  playLaunch() { this.tone(180, 0.28, 'triangle', 0.11, 0, 460); }
  playDocked() { this.tone(320, 0.14, 'sine', 0.08, 0); this.tone(480, 0.16, 'sine', 0.08, 0.09); }
  playReturn() { this.tone(440, 0.12, 'triangle', 0.09, 0); this.tone(660, 0.18, 'triangle', 0.09, 0.08); }
  playUpgrade() { this.tone(360, 0.1, 'triangle', 0.1, 0); this.tone(540, 0.12, 'triangle', 0.1, 0.07); this.tone(720, 0.18, 'sine', 0.1, 0.14); }
  playAlert() { this.tone(440, 0.14, 'sawtooth', 0.09, 0, 310); this.tone(440, 0.16, 'sawtooth', 0.09, 0.18, 310); }
  playJump() {
    this.tone(110, 0.65, 'sawtooth', 0.12, 0, 620);
    this.tone(220, 0.75, 'triangle', 0.1, 0.1, 880);
  }
  playVictory() {
    [261.6, 329.6, 392, 523.2, 659.2].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.11, i * 0.09));
  }
  playDefeat() {
    this.tone(180, 0.5, 'sawtooth', 0.14, 0, 55);
    this.tone(120, 0.7, 'sawtooth', 0.12, 0.2, 36);
  }
}
