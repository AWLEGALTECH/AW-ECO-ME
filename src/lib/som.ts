// Som de notificação sintetizado (Web Audio) — sem depender de arquivo.
// Um "bling" curto e moderno: duas notas senoidais com brilho e decaimento
// suave. Toca quando chega uma notificação com o app aberto.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new AC();
    } catch {
      return null;
    }
  }
  return ctx;
}

function nota(ac: AudioContext, freq: number, inicio: number, dur: number, vol: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  // brilho: um harmônico bem discreto
  const osc2 = ac.createOscillator();
  const gain2 = ac.createGain();
  osc2.type = "triangle";
  osc2.frequency.value = freq * 2;
  gain2.gain.value = 0;

  gain.gain.setValueAtTime(0.00001, inicio);
  gain.gain.exponentialRampToValueAtTime(vol, inicio + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.00001, inicio + dur);
  gain2.gain.setValueAtTime(0.00001, inicio);
  gain2.gain.exponentialRampToValueAtTime(vol * 0.25, inicio + 0.015);
  gain2.gain.exponentialRampToValueAtTime(0.00001, inicio + dur * 0.7);

  osc.connect(gain).connect(ac.destination);
  osc2.connect(gain2).connect(ac.destination);
  osc.start(inicio); osc.stop(inicio + dur + 0.05);
  osc2.start(inicio); osc2.stop(inicio + dur + 0.05);
}

// "Di-ding" ascendente (C6 -> G6), limpo e moderno.
export function tocarSomNotificacao() {
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume().catch(() => {});
  const t = ac.currentTime + 0.02;
  nota(ac, 1046.5, t, 0.28, 0.18);        // C6
  nota(ac, 1567.98, t + 0.11, 0.42, 0.16); // G6
}
