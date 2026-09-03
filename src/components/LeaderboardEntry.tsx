import { useAuthor } from '@/hooks/useAuthor';
import type { GameScore } from '@/hooks/useGameScores';
import { gradeName } from '@/lib/fistEngine';

interface LeaderboardEntryProps {
  score: GameScore;
  index: number;
  isCurrentUser: boolean;
  isHighlighted: boolean;
  currentUserName?: string;
}

export function LeaderboardEntry({
  score,
  index,
  isCurrentUser,
  isHighlighted,
  currentUserName,
}: LeaderboardEntryProps) {
  // Fetch profile for non-current users
  const { data: author } = useAuthor(isCurrentUser ? undefined : score.pubkey);

  const displayName = isCurrentUser
    ? (currentUserName || 'YOU')
    : author?.metadata?.display_name || author?.metadata?.name || `${score.pubkey.slice(0, 8)}...`;

  return (
    <div
      className={`flex justify-between items-center p-2 rounded text-base transition-all ${
        isHighlighted
          ? 'bg-orange-500/30 border-2 border-orange-500 animate-pulse'
          : isCurrentUser
          ? 'bg-orange-900/20 border border-orange-500/50'
          : index === 0
          ? 'bg-yellow-900/30 border border-yellow-500'
          : index === 1
          ? 'bg-gray-700/30 border border-gray-400'
          : index === 2
          ? 'bg-orange-900/30 border border-orange-600'
          : 'bg-gray-800/30'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`font-bold w-7 ${isHighlighted ? 'text-orange-400' : 'text-green-300'}`}>
          #{index + 1}
        </span>
        <span className={`truncate max-w-[160px] ${isCurrentUser ? 'text-orange-400 font-bold' : 'text-white'}`}>
          {displayName}
        </span>
      </div>
      <div className="text-right">
        <div className={`font-bold ${isHighlighted ? 'text-orange-400' : 'text-green-400'}`}>
          {score.score.toLocaleString()}
        </div>
        <div className="text-xs text-green-600">
          {gradeName(score.level)}
        </div>
      </div>
    </div>
  );
}
