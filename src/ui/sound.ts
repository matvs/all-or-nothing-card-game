/**
 * All sounds are synthesized with WebAudio — no audio assets. Muted by
 * default (spec + common decency); the toggle persists in localStorage.
 */
const PREF_KEY = "aon.sound";

let ctx: AudioContext | null = null;
let enabled = false;

try {
  enabled = localStorage.getItem(PREF_KEY) === "on";
} catch {
  enabled = false;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  if (on) ensureContext()?.resume();
}

function ensureContext(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  return ctx;
}

function tone(freq: number, durationMs: number, type: OscillatorType, gainPeak: number, startDelayMs = 0): void {
  const audio = ensureContext();
  if (!audio) return;
  const t0 = audio.currentTime + startDelayMs / 1000;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.connect(gain).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.05);
}

/** Short felt-muffled tap: a card landing on baize. */
export function playCardSound(): void {
  tone(190, 70, "triangle", 0.12);
  tone(95, 90, "sine", 0.1);
}

/** Quick ascending swish for dealing. */
export function playDealSound(index: number): void {
  tone(260 + index * 14, 55, "triangle", 0.06);
}

/** Gentle two-note chime: your turn. */
export function playTurnSound(): void {
  tone(660, 120, "sine", 0.09);
  tone(880, 160, "sine", 0.08, 110);
}

/** Trick swept. */
export function playSweepSound(): void {
  tone(340, 80, "triangle", 0.09);
  tone(240, 120, "triangle", 0.08, 70);
}

/** Round scored: made it / busted. */
export function playScoreSound(made: boolean): void {
  if (made) {
    tone(523, 110, "sine", 0.1);
    tone(659, 110, "sine", 0.1, 100);
    tone(784, 180, "sine", 0.1, 200);
  } else {
    tone(220, 200, "sawtooth", 0.05);
    tone(174, 260, "sawtooth", 0.05, 120);
  }
}
