/**
 * The stage-end chime. WebAudio oscillators rather than a bundled sound file — the HUD has to
 * make this noise a dozen times a day, and a two-note bell is both smaller and easier to keep
 * gentle than any sample would be.
 */
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  context ??= new AudioContext();
  void context.resume();
  return context;
}

function tone(ctx: AudioContext, frequency: number, startAt: number, durationMs: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  const seconds = durationMs / 1000;
  // Ramped rather than switched: an abrupt gain change is heard as a click.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + seconds);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + seconds + 0.02);
}

/** Rising for "focus done", falling for "break over" — which stage ended is audible. */
export function playStageChime(stage: 'focus' | 'break'): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const [first, second] = stage === 'focus' ? [660, 880] : [880, 660];
  tone(ctx, first, now, 260);
  tone(ctx, second, now + 0.16, 380);
}
