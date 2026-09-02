type AudioContextConstructor = typeof AudioContext;

let context: AudioContext | undefined;

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
  const audio = getAudioContext();
  if (!audio) return;

  const now = audio.currentTime;
  const duration = 0.32;
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
  const samples = buffer.getChannelData(0);

  for (let i = 0; i < samples.length; i += 1) {
    const decay = 1 - i / samples.length;
    const clatter = i % Math.max(1, Math.floor(audio.sampleRate * 0.035)) < 180 ? 1 : 0.28;
    samples[i] = (Math.random() * 2 - 1) * decay * clatter;
  }

  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(720, now);
  filter.frequency.exponentialRampToValueAtTime(260, now + duration);
  filter.Q.value = 0.8;
  gain.gain.setValueAtTime(0.11, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  source.start(now);
  source.stop(now + duration);
}

export function playQuillWritingSound() {
  const audio = getAudioContext();
  if (!audio) return;

  const now = audio.currentTime;
  const duration = 0.42;
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
  const samples = buffer.getChannelData(0);

  for (let i = 0; i < samples.length; i += 1) {
    const progress = i / samples.length;
    const stroke = 0.45 + Math.sin(progress * Math.PI * 18) * 0.22;
    const envelope = Math.sin(progress * Math.PI);
    samples[i] = (Math.random() * 2 - 1) * stroke * envelope;
  }

  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1850, now);
  filter.frequency.linearRampToValueAtTime(1150, now + duration);
  filter.Q.value = 1.4;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.07, now + 0.035);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  source.start(now);
  source.stop(now + duration);
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
