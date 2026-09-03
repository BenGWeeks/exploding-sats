# Way of the Exploding Sats - Nostr Event Specification

Way of the Exploding Sats uses the [Gamestr](https://gamestr.io) protocol for decentralized leaderboards.

## Score Events (Kind 30762)

Game scores follow the [Gamestr specification](https://gamestr.io/developers) using kind 30762 (addressable replaceable events).

### Event Structure

```json
{
  "kind": 30762,
  "pubkey": "<game-pubkey>",
  "created_at": 1765623116,
  "content": "Way of the Exploding Sats: 15400 points, graded 3RD DAN",
  "tags": [
    ["d", "exploding-sats:<player-pubkey>:<grade>"],
    ["game", "exploding-sats"],
    ["score", "15400"],
    ["p", "<player-pubkey>"],
    ["state", "active"],
    ["level", "3"],
    ["t", "arcade"],
    ["t", "retro"],
    ["t", "karate"],
    ["t", "fighting"]
  ]
}
```

### Required Tags

| Tag | Description |
|-----|-------------|
| `d` | Unique identifier: `exploding-sats:<player-pubkey>:<grade>` |
| `game` | Game identifier: `exploding-sats` |
| `score` | Numeric score value |
| `p` | Player's Nostr pubkey |
| `state` | Score state: `active` |

### Optional Tags

| Tag | Description |
|-----|-------------|
| `level` | Grade index reached: 0 = Novice, 1 = 1st Dan ... 10 = 10th Dan |
| `duration` | Match duration in seconds |
| `t` | Genre tags |

## Architecture

Scores are signed by the **game's keypair**, not the player's, so players cannot spoof scores.

```
Player finishes a match
        │
        ▼
Game client POSTs to Score Service (/api/publish-score)
        │
        ▼
Score Service signs with GAME_NSEC
        │
        ▼
Published to Nostr relays (kind 30762)
        │
        ▼
Leaderboard queries by game pubkey
```

Game pubkey: `3b48f54aa578e9bbc39172c0b4395efa2ca2ec78d46d82f5965bb06a9f9eebd1`

## Querying Scores

```javascript
// Relays don't index the #game tag, so query by the game's pubkey
const scores = await nostr.query([
  { kinds: [30762], authors: ['3b48f54aa578e9bbc39172c0b4395efa2ca2ec78d46d82f5965bb06a9f9eebd1'], limit: 100 }
]);
```

## Score Service API

### POST /publish-score

```json
{ "playerPubkey": "<player-nostr-pubkey>", "score": 15400, "level": 3 }
```

Response:

```json
{ "success": true, "eventId": "<nostr-event-id>", "pubkey": "<game-pubkey>", "relays": 3 }
```

### GET /health

```json
{ "status": "ok", "gamePubkey": "<game-pubkey>" }
```

## References

- [Gamestr Developer Docs](https://gamestr.io/developers)
- [Nostr Protocol](https://nostr.com)
