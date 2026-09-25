import { bradescoProfile } from "./bradesco.js";
import { itauProfile } from "./itau.js";
import { bbProfile } from "./bb.js";
import { caixaProfile } from "./caixa.js";
import { santanderProfile } from "./santander.js";
import { agibankProfile } from "./agibank.js";

export const BANK_PROFILES = [
  bradescoProfile,
  itauProfile,
  bbProfile,
  caixaProfile,
  santanderProfile,
  agibankProfile,
];

export function detectBank(pageTexts) {
  const texts = Array.isArray(pageTexts) ? pageTexts : [pageTexts];
  const combined = texts.join(" ");

  let bestProfile = null;
  let bestScore = 0;
  for (const profile of BANK_PROFILES) {
    const score = profile.score ? profile.score(combined, texts) : (profile.detect(combined) ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestProfile = profile;
    }
  }
  const result = bestProfile || bradescoProfile; // fallback only if ALL score 0
  result._lastScore = bestScore;
  return result;
}
