// The dialogue queue: lines spoken by the cast, each shown for a time long enough to read,
// with the speaker's portrait drawn by the HUD.

export function createDialogue() {
  return { queue: [], current: null, t: 0 };
}

/** Queue lines as [speakerId, text] pairs. */
export function sayLines(game, lines) {
  for (const [who, text] of lines) game.dialogue.queue.push({ who, text, dur: Math.min(6.5, 1.8 + text.length * 0.045) });
}

export function clearDialogue(game) {
  game.dialogue.queue.length = 0;
  game.dialogue.current = null;
}

export function updateDialogue(game, dt) {
  const d = game.dialogue;
  if (d.current) {
    d.t += dt;
    if (d.t >= d.current.dur) d.current = null;
  }
  if (!d.current && d.queue.length) {
    d.current = d.queue.shift();
    d.t = 0;
    game.events.push({ type: 'dialogue', who: d.current.who });
  }
}

/** Skip to the next line (Enter during play). */
export function skipLine(game) {
  if (game.dialogue.current) game.dialogue.t = game.dialogue.current.dur;
}
