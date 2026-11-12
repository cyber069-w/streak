/**
 * A soft singing-bowl chime made with Web Audio (no sound file). iOS only plays audio from a context that was
 * started by a tap, so call `primeAudio()` from the Start button.
 */
let ctx: AudioContext | null = null;

export function primeAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function chime() {
  if (!ctx) primeAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.05;
  // three strikes, a few seconds apart; each a fundamental with two soft overtones
  for (const [i, at] of [0, 3.5, 7].entries()) {
    for (const [f, g] of [[220, 0.22], [552, 0.08], [880 * 1.01, 0.04]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const start = t0 + at;
      const level = g * (1 - i * 0.2);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(level, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 5.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 5.6);
    }
  }
}
