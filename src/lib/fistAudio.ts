/**
 * Audio engine for Way of the Exploding Sats.
 *
 * The C64 original used digitised samples: pitch-varied kiai shouts on every attack,
 * a bone "CRACK" when a blow lands and a "THUD" when a fighter hits the floor, plus
 * SID music - an oriental tune for the demo and a slower, moodier one in play.
 * Everything here is synthesised with the Web Audio API.
 */

// Safari compatibility
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

type Note = { freq: number; duration: number; rest?: number };

// Pentatonic oriental theme for the attract mode / title
const TITLE_THEME: Note[] = [
  { freq: 294, duration: 0.28 }, { freq: 349, duration: 0.28 }, { freq: 392, duration: 0.28 }, { freq: 440, duration: 0.56 },
  { freq: 392, duration: 0.28 }, { freq: 349, duration: 0.28 }, { freq: 294, duration: 0.56 },
  { freq: 262, duration: 0.28 }, { freq: 294, duration: 0.28 }, { freq: 349, duration: 0.56 },
  { freq: 294, duration: 0.28 }, { freq: 262, duration: 0.28 }, { freq: 220, duration: 0.84, rest: 0.28 },
  { freq: 440, duration: 0.28 }, { freq: 523, duration: 0.28 }, { freq: 587, duration: 0.56 },
  { freq: 523, duration: 0.28 }, { freq: 440, duration: 0.28 }, { freq: 392, duration: 0.56 },
  { freq: 349, duration: 0.28 }, { freq: 392, duration: 0.28 }, { freq: 294, duration: 1.12, rest: 0.56 },
];

// Slower, atmospheric in-game tune
const GAME_THEME: Note[] = [
  { freq: 220, duration: 0.9 }, { freq: 262, duration: 0.45 }, { freq: 294, duration: 0.9 }, { freq: 262, duration: 0.45 },
  { freq: 220, duration: 0.9 }, { freq: 196, duration: 0.45 }, { freq: 175, duration: 1.35, rest: 0.45 },
  { freq: 294, duration: 0.9 }, { freq: 349, duration: 0.45 }, { freq: 392, duration: 0.9 }, { freq: 349, duration: 0.45 },
  { freq: 294, duration: 0.9 }, { freq: 262, duration: 0.45 }, { freq: 220, duration: 1.35, rest: 0.9 },
];

export type MusicKind = 'title' | 'game';

class FistAudio {
  private context: AudioContext | null = null;
  private musicTimer: number | null = null;
  private isMuted = false;
  public isMusicPlaying = false;
  public currentMusic: MusicKind | null = null;

  /** Must be called during a user gesture (click/tap/key). */
  initialize() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextClass();
    }
    if (this.context.state === 'suspended' || (this.context.state as string) === 'interrupted') {
      this.context.resume();
    }
  }

  /** Unlock audio on first interaction and resume when the tab becomes visible again. */
  setupAutoUnlock() {
    const unlock = () => this.initialize();
    ['touchstart', 'touchend', 'mousedown', 'click', 'keydown'].forEach((event) => {
      document.addEventListener(event, unlock, { capture: true, once: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.context) {
        if (this.context.state === 'suspended' || (this.context.state as string) === 'interrupted') {
          this.context.resume();
        }
      }
    });
  }

  private tone(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.12, when = 0) {
    if (!this.context || this.isMuted) return;
    const t = this.context.currentTime + when;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.connect(gain);
    gain.connect(this.context.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration);
  }

  private noise(duration: number, filterFrom: number, filterTo: number, volume = 0.2, type: BiquadFilterType = 'lowpass', when = 0) {
    if (!this.context || this.isMuted) return;
    const t = this.context.currentTime + when;
    const size = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, size, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;

    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.context.destination);
    filter.type = type;
    filter.frequency.setValueAtTime(filterFrom, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, filterTo), t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.start(t);
    source.stop(t + duration);
  }

  /** "AAARGH!" kiai - three pitch variants, like the sampled shouts in the original. */
  playKiai(variant = 0) {
    if (!this.context || this.isMuted) return;
    const base = [330, 294, 370][variant % 3];
    this.noise(0.26, 1200 + variant * 200, 400, 0.16, 'bandpass');
    const t = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.connect(gain);
    gain.connect(this.context.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 0.6, t + 0.24);
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  /** Whoosh for a kick or punch that hits nothing but air. */
  playWhoosh() {
    this.noise(0.14, 700, 2600, 0.06, 'bandpass');
  }

  /** Bone-crunching CRACK when a blow lands. Clean full-point hits crack harder. */
  playCrack(full: boolean) {
    if (!this.context || this.isMuted) return;
    this.noise(full ? 0.22 : 0.14, 3200, 200, full ? 0.32 : 0.22, 'lowpass');
    this.noise(0.05, 5000, 2500, 0.2, 'highpass');
    const t = this.context.currentTime;
    const boom = this.context.createOscillator();
    const gain = this.context.createGain();
    boom.connect(gain);
    gain.connect(this.context.destination);
    boom.type = 'square';
    boom.frequency.setValueAtTime(full ? 150 : 210, t);
    boom.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    boom.start(t);
    boom.stop(t + 0.22);
  }

  /** Blocked attack - dull clack. */
  playBlock() {
    this.noise(0.08, 2500, 900, 0.12, 'highpass');
    this.tone(180, 0.08, 'square', 0.08);
  }

  /** THUD - a fighter hits the floor. */
  playThud() {
    this.noise(0.32, 500, 60, 0.28);
    this.tone(65, 0.3, 'sine', 0.22);
    this.tone(120, 0.12, 'sawtooth', 0.05, 0.05); // groan
  }

  /** Point awarded: half point = two notes, full point = rising triad. */
  playPoint(full: boolean) {
    if (full) {
      this.tone(523, 0.12, 'square', 0.1);
      this.tone(659, 0.12, 'square', 0.1, 0.12);
      this.tone(784, 0.3, 'square', 0.1, 0.24);
    } else {
      this.tone(523, 0.12, 'square', 0.1);
      this.tone(659, 0.25, 'square', 0.1, 0.12);
    }
  }

  /** Bout won. */
  playWin() {
    const notes = [392, 494, 587, 784];
    notes.forEach((freq, i) => {
      this.tone(freq, 0.18, 'square', 0.1, i * 0.14);
      this.tone(freq * 1.5, 0.14, 'triangle', 0.06, i * 0.14);
    });
    this.tone(784, 0.5, 'square', 0.1, 0.6);
  }

  /** Promotion to the next Dan. */
  playPromotion() {
    const notes = [523, 587, 659, 784, 880, 1047];
    notes.forEach((freq, i) => this.tone(freq, 0.16, 'square', 0.1, i * 0.1));
    this.tone(1047, 0.6, 'square', 0.1, 0.65);
    this.tone(523, 0.6, 'triangle', 0.08, 0.65);
  }

  /** Bout lost / game over - the descending SID jingle. */
  playDefeat() {
    const notes = [392, 349, 311, 262, 233, 196];
    notes.forEach((freq, i) => {
      this.tone(freq, 0.25, 'square', 0.1, i * 0.22);
      this.tone(freq / 2, 0.25, 'triangle', 0.08, i * 0.22);
    });
  }

  /** Clock ticking in the last five seconds. */
  playTick() {
    this.tone(1200, 0.04, 'square', 0.06);
  }

  /** Time bonus counting down. */
  playBonusTick() {
    this.tone(880, 0.05, 'square', 0.07);
    this.tone(1320, 0.05, 'square', 0.04, 0.03);
  }

  /** Charging bull - galloping thumps. */
  playGallop() {
    this.noise(0.09, 300, 60, 0.18);
    this.noise(0.09, 300, 60, 0.14, 'lowpass', 0.11);
  }

  /** Bull stopped in its tracks. */
  playBullDown() {
    this.noise(0.5, 700, 50, 0.3);
    this.tone(110, 0.4, 'sawtooth', 0.12);
    this.tone(82, 0.5, 'sawtooth', 0.1, 0.1);
  }

  startMusic(kind: MusicKind = 'game') {
    if (this.isMusicPlaying && this.currentMusic === kind) return;
    this.stopMusic();
    this.initialize();
    this.isMusicPlaying = true;
    this.currentMusic = kind;
    const theme = kind === 'title' ? TITLE_THEME : GAME_THEME;

    let index = 0;
    const playNext = () => {
      if (!this.isMusicPlaying) return;
      const note = theme[index % theme.length];
      this.tone(note.freq, note.duration * 0.9, kind === 'title' ? 'square' : 'triangle', 0.06);
      this.tone(note.freq / 2, note.duration * 0.9, 'triangle', 0.045);
      if (kind === 'title' && index % 2 === 0) this.tone(note.freq * 2, 0.05, 'sawtooth', 0.03);
      index++;
      this.musicTimer = window.setTimeout(playNext, (note.duration + (note.rest ?? 0)) * 1000);
    };
    playNext();
  }

  stopMusic() {
    this.isMusicPlaying = false;
    this.currentMusic = null;
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) this.stopMusic();
  }

  toggleMute() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }
}

export const fistAudio = new FistAudio();
