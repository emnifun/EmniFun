/**
 * FiveWink sound layer.
 *
 * Keyboard interactions call this module instead of talking directly to the
 * Web Audio API, so a future global sound preference can be added here
 * without changing individual keyboard handlers.
 */

let soundEnabled = true;
let audioContext = null;
let masterGain = null;

function getAudioContext() {
  if (audioContext) return audioContext;

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;

  audioContext = new AudioContextCtor();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.15;
  masterGain.connect(audioContext.destination);

  return audioContext;
}

function playTone(context, {
  frequency,
  duration,
  volume,
  type = "sine",
  endFrequency = frequency
}) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(40, endFrequency),
    now + duration
  );

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(masterGain);

  oscillator.start(now);
  oscillator.stop(now + duration + 0.01);
}

function playKeyboardSound(context, kind) {
  switch (kind) {
    case "enter":
      playTone(context, {
        frequency: 520,
        endFrequency: 760,
        duration: 0.065,
        volume: 0.7,
        type: "sine"
      });
      return;
    case "backspace":
      playTone(context, {
        frequency: 720,
        endFrequency: 460,
        duration: 0.045,
        volume: 0.5,
        type: "triangle"
      });
      return;
    case "key":
    default:
      playTone(context, {
        frequency: 900,
        endFrequency: 640,
        duration: 0.035,
        volume: 0.42,
        type: "triangle"
      });
  }
}

/**
 * Play a short FiveWink interaction sound.
 *
 * Future settings can use setFiveWinkSoundEnabled() without changing
 * individual UI event handlers.
 */
export function playFiveWinkSound(kind = "key") {
  if (!soundEnabled) return;

  try {
    const context = getAudioContext();
    if (!context) return;

    const resumeResult = context.state === "suspended" ? context.resume() : null;

    if (resumeResult?.catch) {
      resumeResult
        .then(() => {
          if (soundEnabled) playKeyboardSound(context, kind);
        })
        .catch(() => {});
      return;
    }

    playKeyboardSound(context, kind);
  } catch {
    // Audio is optional. Never allow sound failure to affect gameplay.
  }
}

export function setFiveWinkSoundEnabled(enabled) {
  soundEnabled = Boolean(enabled);
}

export function isFiveWinkSoundEnabled() {
  return soundEnabled;
}
