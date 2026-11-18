// Validation for POST /publish-score.

export const MAX_SCORE = 10000000;
const MAX_DURATION_SECONDS = 24 * 60 * 60;

/**
 * Checks a score submission. Returns { error } for a bad request, otherwise
 * { value } holding only the fields the service signs.
 *
 * `typeof NaN === 'number'` and NaN fails every range comparison, so score and
 * level must be checked with Number.isFinite / Number.isInteger.
 */
export function validateScoreSubmission(body, { maxLevel }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Missing required fields: playerPubkey, score, level' };
  }
  const { playerPubkey, score, level } = body;
  if (playerPubkey === undefined || score === undefined || level === undefined) {
    return { error: 'Missing required fields: playerPubkey, score, level' };
  }
  if (typeof playerPubkey !== 'string' || !/^[0-9a-f]{64}$/i.test(playerPubkey)) {
    return { error: 'Invalid playerPubkey: must be 64-character hex string' };
  }
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
    return { error: 'Invalid score value' };
  }
  if (!Number.isInteger(level) || level < 0 || level > maxLevel) {
    return { error: 'Invalid level value' };
  }
  // Optional tags
  const { difficulty, duration } = body;
  if (difficulty !== undefined && (typeof difficulty !== 'string' || !/^[\w -]{1,32}$/.test(difficulty))) {
    return { error: 'Invalid difficulty value' };
  }
  if (duration !== undefined && (!Number.isFinite(duration) || duration < 0 || duration > MAX_DURATION_SECONDS)) {
    return { error: 'Invalid duration value' };
  }

  const value = {
    playerPubkey: playerPubkey.toLowerCase(),
    // Half-value hits can produce .5 scores in the engine: publish whole points.
    score: Math.round(score),
    level,
  };
  if (difficulty !== undefined) value.difficulty = difficulty;
  if (duration !== undefined) value.duration = Math.round(duration);
  return { value };
}
