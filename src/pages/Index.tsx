import { useSeoMeta } from '@unhead/react';
import { Navigate } from 'react-router-dom';

const Index = () => {
  useSeoMeta({
    title: 'Way of the Exploding Sats - Bitcoin Karate Game',
    description: 'A faithful tribute to the 1985 karate classic Way of the Exploding Fist. Pay 21 sats to play. Publish your high scores to the decentralized Nostr leaderboard.',
  });

  // Redirect to game page
  return <Navigate to="/game" replace />;
};

export default Index;
