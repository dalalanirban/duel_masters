export interface BattlezoneLogEntry {
  id: string;
  actor: 'player' | 'opponent';
  text: string;
  createdAt: number;
}

/**
 * Rewrites an engine action log line into active voice from the acting player's perspective.
 * E.g. "Player broke Opponent's shield!" -> "I break your shield"
 */
export function toActiveVoiceLog(rawLog: string, actor: 'player' | 'opponent'): string {
  const trimmed = rawLog.trim();
  if (!trimmed) return trimmed;

  const targetLabel = actor === 'player' ? 'Opponent' : 'Player';

  let text = trimmed.replace(/^\[Turn\s+\d+\]\s*/i, '');

  // Strip leading actor label (case-insensitive: "player " or "opponent ")
  if (/^(player|opponent)\s+/i.test(text)) {
    text = text.replace(/^(player|opponent)\s+/i, '');
  } else {
    return trimmed;
  }

  // Replace target possessive/object references with "your" / "you"
  text = text
    .replace(new RegExp(`\\b${targetLabel}'s\\b`, 'gi'), 'your')
    .replace(new RegExp(`\\b${targetLabel}\\b`, 'gi'), 'you');

  // Convert common past-tense or 3rd-person singular verbs to active first-person present
  const verbMap: Array<[RegExp, string]> = [
    [/^(broke|breaks)\b/i, 'break'],
    [/^(summoned|summons)\b/i, 'summon'],
    [/^(evolved|evolves)\b/i, 'evolve'],
    [/^(cast|casts)\b/i, 'cast'],
    [/^(charged|charges)\b/i, 'charge'],
    [/^(attacked|attacks)\b/i, 'attack'],
    [/^(blocked|blocks)\b/i, 'block'],
    [/^(drew|draws)\b/i, 'draw'],
    [/^(discarded|discards)\b/i, 'discard'],
    [/^(destroyed|destroys)\b/i, 'destroy'],
    [/^(tapped|taps)\b/i, 'tap'],
    [/^(untapped|untaps)\b/i, 'untap'],
    [/^(returned|returns)\b/i, 'return'],
    [/^(triggered|triggers)\b/i, 'trigger'],
    [/^(activated|activates)\b/i, 'activate'],
    [/^(ended|ends)\b/i, 'end'],
    [/^(passed|passes)\b/i, 'pass'],
    [/^(started|starts)\b/i, 'start'],
  ];

  for (const [pattern, replacement] of verbMap) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
      break;
    }
  }

  return `I ${text}`;
}
