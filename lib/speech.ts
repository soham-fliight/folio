export const RATES = {
  unhurried: 0.86,
  steady: 1,
  brisk: 1.14,
} as const;

export type RateName = keyof typeof RATES;

export function pickVoice(voices: SpeechSynthesisVoice[], preferredUri?: string): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  if (preferredUri) {
    const chosen = voices.find((voice) => voice.voiceURI === preferredUri);
    if (chosen) return chosen;
  }
  const ranked = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a));
  return ranked[0] ?? null;
}

function scoreVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  let score = 0;
  if (voice.lang.toLowerCase().startsWith("en")) score += 6;
  if (voice.localService) score += 1;
  if (/natural|premium|enhanced|neural|samantha|daniel|serena|moira|karen/.test(name)) score += 3;
  if (/compact|espeak/.test(name)) score -= 2;
  return score;
}

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve([]);
  const existing = window.speechSynthesis.getVoices();
  if (existing.length) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const finish = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener("voiceschanged", finish, { once: true });
    window.setTimeout(finish, 800);
  });
}

type RecognitionResult = { transcript: string; isFinal: boolean };

type RecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

export function canListen(): boolean {
  if (typeof window === "undefined") return false;
  const host = window as Window & { SpeechRecognition?: new () => RecognitionInstance; webkitSpeechRecognition?: new () => RecognitionInstance };
  return Boolean(host.SpeechRecognition || host.webkitSpeechRecognition);
}

export function listenOnce(handlers: {
  onText: (result: RecognitionResult) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): { stop: () => void } | null {
  const host = window as Window & { SpeechRecognition?: new () => RecognitionInstance; webkitSpeechRecognition?: new () => RecognitionInstance };
  const Ctor = host.SpeechRecognition || host.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onresult = (event) => {
    let transcript = "";
    let isFinal = false;
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0]?.transcript ?? "";
      if (event.results[i].isFinal) isFinal = true;
    }
    handlers.onText({ transcript: transcript.trim(), isFinal });
  };
  recognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    handlers.onError(
      event.error === "not-allowed"
        ? "The microphone is blocked. You can still write the note."
        : "The microphone stopped. You can still write the note.",
    );
  };
  recognition.onend = () => handlers.onEnd();
  recognition.start();
  return { stop: () => recognition.stop() };
}
