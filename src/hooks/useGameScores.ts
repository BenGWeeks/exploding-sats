import { useQuery } from '@tanstack/react-query';
import { NPool, NRelay1 } from '@nostrify/nostrify';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

// Gamestr kind for game scores (addressable replaceable)
export const GAME_SCORE_KIND = 30762;
const GAME_ID = 'exploding-sats';
// Game's pubkey (from env) - used to query scores by author
const GAME_PUBKEY = import.meta.env.VITE_GAME_PUBKEY;

// Validate at startup
if (!GAME_PUBKEY) {
  console.warn('[Leaderboard] VITE_GAME_PUBKEY not set - leaderboard will be empty');
}

// Game-specific relays for leaderboard data (dedicated pool, not affected by app state)
const GAME_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
];

// Dedicated pool for game score queries - independent of main app pool
const gamePool = new NPool({
  open(url: string) {
    return new NRelay1(url);
  },
  reqRouter(filters: NostrFilter[]) {
    const routes = new Map<string, NostrFilter[]>();
    for (const url of GAME_RELAYS) {
      routes.set(url, filters);
    }
    return routes;
  },
  eventRouter() {
    return GAME_RELAYS;
  },
});

export interface GameScore {
  pubkey: string; // Player's pubkey (from p tag)
  score: number;
  level: number;
  timestamp: number;
  event: NostrEvent;
}

// Helper to get tag value
function getTagValue(event: NostrEvent, tagName: string): string | undefined {
  const tag = event.tags.find(t => t[0] === tagName);
  return tag?.[1];
}

function validateGameScore(event: NostrEvent): boolean {
  if (event.kind !== GAME_SCORE_KIND) return false;

  const game = getTagValue(event, 'game');
  const score = getTagValue(event, 'score');
  const playerPubkey = getTagValue(event, 'p');

  return (
    game === GAME_ID &&
    score !== undefined &&
    !isNaN(parseInt(score, 10)) &&
    playerPubkey !== undefined
  );
}

function parseGameScore(event: NostrEvent): GameScore {
  const playerPubkey = getTagValue(event, 'p') || event.pubkey;
  const score = parseInt(getTagValue(event, 'score') || '0', 10);
  const level = parseInt(getTagValue(event, 'level') || '1', 10);

  return {
    pubkey: playerPubkey,
    score,
    level,
    timestamp: event.created_at,
    event,
  };
}

export function useGameScores(limit = 50, enabled = true) {
  return useQuery({
    queryKey: ['game-scores', limit],
    staleTime: 30000, // 30 seconds - allows refetch if empty
    retry: false, // Don't retry failed queries - causes lag
    enabled, // Only connect to relays when needed
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);
      // Query by game author pubkey (relays don't index #game tag)
      const events = await gamePool.query(
        [{ kinds: [GAME_SCORE_KIND], authors: [GAME_PUBKEY], limit: limit * 2 }],
        { signal }
      );

      const validEvents = events.filter(validateGameScore);
      const scores = validEvents.map(parseGameScore);

      // Sort by score descending and take top N
      return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
  });
}

export function useUserBestScore(pubkey?: string) {
  return useQuery({
    queryKey: ['user-best-score', pubkey],
    staleTime: 30000, // 30 seconds - allows refetch if empty
    retry: false, // Don't retry failed queries - causes lag
    queryFn: async (c) => {
      if (!pubkey) return null;

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);
      // Query by game author and player pubkey
      const events = await gamePool.query(
        [{ kinds: [GAME_SCORE_KIND], authors: [GAME_PUBKEY], '#p': [pubkey], limit: 100 }],
        { signal }
      );

      const validEvents = events.filter(validateGameScore);

      if (validEvents.length === 0) return null;

      const scores = validEvents.map(parseGameScore);

      // Return the highest score
      return scores.reduce((best, current) =>
        current.score > best.score ? current : best
      );
    },
    enabled: !!pubkey,
  });
}
