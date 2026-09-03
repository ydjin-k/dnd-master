type AudioContextConstructor = typeof AudioContext;

let context: AudioContext | undefined;

function playAudioFile(src: string, volume = 0.55) {
  const audio = new Audio(src);
  audio.volume = volume;
  void audio.play().catch(() => undefined);
}

export function playLevelUpSound() {
  playAudioFile("/audio/level-up.mp3", 0.65);
}

export function playCoinsSound() {
  playAudioFile("/audio/coins-jingle.mp3", 0.55);
}

function getAudioContext(): AudioContext | undefined {
  const AudioContextClass = window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: AudioContextConstructor })
      .webkitAudioContext;

  if (!AudioContextClass) return undefined;
  context ??= new AudioContextClass();
  if (context.state === "suspended") void context.resume();
  return context;
}

export function playButtonClickSound() {
  const audio = getAudioContext();
  if (!audio) return;

  const now = audio.currentTime;
  const gain = audio.createGain();
  const lowChime = audio.createOscillator();
  const highChime = audio.createOscillator();

  lowChime.type = "triangle";
  lowChime.frequency.setValueAtTime(330, now);
  lowChime.frequency.exponentialRampToValueAtTime(247, now + 0.075);
  highChime.type = "sine";
  highChime.frequency.setValueAtTime(660, now);
  highChime.frequency.exponentialRampToValueAtTime(494, now + 0.055);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.055, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

  lowChime.connect(gain);
  highChime.connect(gain);
  gain.connect(audio.destination);
  lowChime.start(now);
  highChime.start(now);
  lowChime.stop(now + 0.1);
  highChime.stop(now + 0.1);
}

export function playDiceRollSound() {
  playAudioFile("/audio/dice-roll.wav", 0.55);
}

export function playSpellCastSound() {
  const audio = getAudioContext();
  if (!audio) return;

  const now = audio.currentTime;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
  gain.connect(audio.destination);
  [392, 523.25, 783.99].forEach((frequency, index) => {
    const tone = audio.createOscillator();
    tone.type = index === 2 ? "sine" : "triangle";
    tone.frequency.setValueAtTime(frequency, now + index * 0.055);
    tone.frequency.exponentialRampToValueAtTime(frequency * 1.5, now + 0.42);
    tone.connect(gain);
    tone.start(now + index * 0.055);
    tone.stop(now + 0.54);
  });
}

export function playLimitSound() {
  const audio = getAudioContext();
  if (!audio) return;
  const now = audio.currentTime;
  const tone = audio.createOscillator();
  const gain = audio.createGain();
  tone.type = "triangle";
  tone.frequency.setValueAtTime(196, now);
  tone.frequency.exponentialRampToValueAtTime(146.83, now + 0.18);
  gain.gain.setValueAtTime(0.11, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  tone.connect(gain);
  gain.connect(audio.destination);
  tone.start(now);
  tone.stop(now + 0.23);
}

export function playCriticalSuccessSound() {
  playAudioFile("/audio/dice-crit-success.mp3", 0.65);
}

export function playCriticalFailSound() {
  playAudioFile("/audio/dice-crit-fail.mp3", 0.6);
}

export function installButtonClickSound(
  owner: Document = document,
  play: () => void = playButtonClickSound,
) {
  const onClick = (event: MouseEvent) => {
    const origin = event.target;
    if (!(origin instanceof Element)) return;
    const button = origin.closest<HTMLElement>('button, [role="button"]');
    if (!button || button.matches(":disabled") || button.getAttribute("aria-disabled") === "true") {
      return;
    }
    play();
  };

  owner.addEventListener("click", onClick, { capture: true });
  return () => owner.removeEventListener("click", onClick, { capture: true });
}
