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
  const bodyGain = audio.createGain();
  const body = audio.createOscillator();
  const strikeGain = audio.createGain();
  const strike = audio.createOscillator();

  body.type = "triangle";
  body.frequency.setValueAtTime(240, now);
  body.frequency.exponentialRampToValueAtTime(150, now + 0.075);
  bodyGain.gain.setValueAtTime(0.0001, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.075, now + 0.004);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);

  strike.type = "square";
  strike.frequency.setValueAtTime(1700, now);
  strike.frequency.exponentialRampToValueAtTime(1250, now + 0.025);
  strikeGain.gain.setValueAtTime(0.0001, now);
  strikeGain.gain.exponentialRampToValueAtTime(0.032, now + 0.003);
  strikeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

  body.connect(bodyGain);
  strike.connect(strikeGain);
  bodyGain.connect(audio.destination);
  strikeGain.connect(audio.destination);
  body.start(now);
  strike.start(now);
  body.stop(now + 0.085);
  strike.stop(now + 0.035);
}

export function playDiceRollSound() {
  playAudioFile("/audio/dice-roll.wav", 0.55);
}

export function playSpellCastSound() {
  playAudioFile("/audio/spell-cast.mp3", 0.6);
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
    if (
      !button ||
      button.matches(":disabled") ||
      button.getAttribute("aria-disabled") === "true" ||
      button.hasAttribute("data-own-sound")
    ) {
      return;
    }
    play();
  };

  owner.addEventListener("click", onClick, { capture: true });
  return () => owner.removeEventListener("click", onClick, { capture: true });
}
