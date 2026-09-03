#!/usr/bin/env node
/**
 * Publish kind 0 (profile metadata) for the Exploding Sats game identity.
 *
 * Usage: GAME_NSEC=nsec1... node scripts/publish-profile.js
 */

import { NPool, NRelay1, NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://nostr.wine',
  'wss://eden.nostr.land',
  'wss://nostr.bitcoiner.social',
  'wss://nostr.oxtr.dev',
  'wss://relay.nostr.net',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://nostr.land',
];

const PROFILE = {
  name: 'Way of the Exploding Sats',
  picture: 'https://www.explodingsats.com/apple-touch-icon.png',
  about: 'Way of the Exploding Sats - a tribute to the 1985 karate classic. Pay 21 sats to play. Publish your high scores to the decentralized Nostr leaderboard.',
  website: 'https://www.explodingsats.com',
  lud16: 'space.zappers@bank.weeksfamily.me',
};

async function main() {
  const nsec = process.env.GAME_NSEC;
  if (!nsec) {
    console.error('GAME_NSEC environment variable is required');
    process.exit(1);
  }

  // Decode nsec and create signer
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') {
    console.error('Invalid GAME_NSEC format');
    process.exit(1);
  }
  const signer = new NSecSigner(decoded.data);
  const pubkey = await signer.getPublicKey();

  console.log('Publishing kind 0 profile for:', pubkey);
  console.log('npub:', nip19.npubEncode(pubkey));
  console.log('Profile:', JSON.stringify(PROFILE, null, 2));
  console.log('Relays:', RELAYS.join(', '));

  // Create pool
  const pool = new NPool({
    open(url) { return new NRelay1(url); },
    reqRouter() { return new Map(); },
    eventRouter() { return RELAYS; },
  });

  // Create kind 0 event
  const event = {
    kind: 0,
    content: JSON.stringify(PROFILE),
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  };

  // Sign event
  const signedEvent = await signer.signEvent(event);
  console.log('\nSigned event ID:', signedEvent.id);

  // Publish to relays
  try {
    const results = await pool.event(signedEvent);
    console.log('\nPublished successfully!');
    console.log('Results:', results);
  } catch (error) {
    console.error('Failed to publish:', error.message);
    process.exit(1);
  }

  // Give time for relay acknowledgments
  await new Promise(resolve => setTimeout(resolve, 2000));
  process.exit(0);
}

main();
