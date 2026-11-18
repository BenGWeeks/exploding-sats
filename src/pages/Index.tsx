import { useSeoMeta } from '@unhead/react';
import { Navigate } from 'react-router-dom';

const Index = () => {
  useSeoMeta({
    title: 'Exploding Sats - Bitcoin Karate Game',
    description: 'A retro one-on-one karate game where bouts are won on points, paid for with Bitcoin Lightning. Pay 21 sats to play and publish your high scores to the decentralized Nostr leaderboard.',
  });

  // Redirect to game page
  return <Navigate to="/game" replace />;
};

export default Index;
