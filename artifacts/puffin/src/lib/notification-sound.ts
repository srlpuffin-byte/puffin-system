/**
 * Reproductor de sonido de notificación utilizando Web Audio API nativo.
 * No requiere descargar archivos de audio externos, funciona 100% offline y en iOS Safari / PWA.
 */
let audioCtx: AudioContext | null = null;

export function playNotificationSound(type: "message" | "alert" = "message") {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    if (type === "message") {
      // Chime elegante y sutil de dos tonos (estilo iOS / WhatsApp): F5 -> A5 (698Hz -> 880Hz)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(698.46, now);
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12);

      gain1.gain.setValueAtTime(0.25, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Armónico agudo cristalino
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();

      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1318.51, now + 0.08); // E6
      gain2.gain.setValueAtTime(0.18, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.45);
    } else {
      // Alerta de atención: tono doble grave a agudo
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554.37, now + 0.1);
      osc.frequency.setValueAtTime(659.25, now + 0.2);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  } catch (err) {
    // Ignorar si el usuario aún no interactuó con la pestaña para permitir audio
  }
}
