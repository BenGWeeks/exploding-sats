import { useEffect, useState, useCallback, useRef } from 'react';

// Android Chrome PWA install prompt event
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
import { useQueryClient } from '@tanstack/react-query';
import { Zap, Volume2, VolumeX, Trophy, Share2, Play, Pause, Copy, Check, HelpCircle, LogOut, Wallet, UserPlus, RotateCcw, Users, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FistCanvas, CANVAS_WIDTH, CANVAS_HEIGHT } from '@/components/FistCanvas';
import { LeaderboardEntry } from '@/components/LeaderboardEntry';
import { LoginArea } from '@/components/auth/LoginArea';
import LoginDialog from '@/components/auth/LoginDialog';
import { JoystickControls } from '@/components/JoystickControls';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useOrientation } from '@/hooks/useOrientation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useGameScores } from '@/hooks/useGameScores';
import { useToast } from '@/hooks/useToast';
import { useWallet } from '@/hooks/useWallet';
import { useNWC } from '@/hooks/useNWCContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  createInitialState,
  updateGame,
  gradeName,
  NEUTRAL_INPUT,
  FRAME_RATE,
  type GameState,
  type FighterInput,
  type JoystickDirection,
  type GameEvent,
} from '@/lib/fistEngine';
import { fistAudio } from '@/lib/fistAudio';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLNbitsPayment } from '@/hooks/useLNbitsPayment';
import QRCode from 'qrcode';
import { WalletModal } from '@/components/WalletModal';

const GAME_COST_SATS = 21;
// ?showcase hides the attract overlay so the CPU vs CPU demo can be watched/recorded
const SHOWCASE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('showcase');
const SITE_URL = 'https://www.explodingsats.com';
const HIGH_SCORE_KEY = 'exploding-sats-high-score';

// Lightning / LNbits configuration from environment
const RECIPIENT_LIGHTNING_ADDRESS = import.meta.env.VITE_LIGHTNING_ADDRESS || 'space.zappers@bank.weeksfamily.me';
const LNBITS_URL = import.meta.env.VITE_LNBITS_URL || '/lnbits';
const LNBITS_INVOICE_KEY = import.meta.env.VITE_LNBITS_INVOICE_KEY || '';

// Keyboard: arrows = joystick, Space / Shift / Ctrl = fire (player 1); WASD + F/G (player 2)
const P1_KEYS: Record<string, keyof KeyState> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  ' ': 'fire', Shift: 'fire', Control: 'fire',
};
const P2_KEYS: Record<string, keyof KeyState> = {
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
  f: 'fire', g: 'fire', F: 'fire', G: 'fire',
};

interface KeyState { up: boolean; down: boolean; left: boolean; right: boolean; fire: boolean }
const emptyKeys = (): KeyState => ({ up: false, down: false, left: false, right: false, fire: false });

function keysToInput(k: KeyState): FighterInput {
  return {
    dir: {
      x: k.left && !k.right ? -1 : k.right && !k.left ? 1 : 0,
      y: k.up && !k.down ? -1 : k.down && !k.up ? 1 : 0,
    },
    fire: k.fire,
  };
}

function gamepadInput(index: number): FighterInput | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  const pad = navigator.getGamepads()[index];
  if (!pad) return null;
  const ax = pad.axes[0] ?? 0;
  const ay = pad.axes[1] ?? 0;
  const dpadUp = pad.buttons[12]?.pressed, dpadDown = pad.buttons[13]?.pressed;
  const dpadLeft = pad.buttons[14]?.pressed, dpadRight = pad.buttons[15]?.pressed;
  const x = dpadLeft || ax < -0.5 ? -1 : dpadRight || ax > 0.5 ? 1 : 0;
  const y = dpadUp || ay < -0.5 ? -1 : dpadDown || ay > 0.5 ? 1 : 0;
  const fire = [0, 1, 2, 3, 5, 7].some((b) => pad.buttons[b]?.pressed);
  return { dir: { x, y }, fire };
}

interface UiSnapshot {
  phase: GameState['phase'];
  gameOver: boolean;
  score: number;
  grade: number;
  bout: number;
  boutWinner: 0 | 1 | null;
  p2Score: number;
}

function snapshot(state: GameState): UiSnapshot {
  return {
    phase: state.phase,
    gameOver: state.gameOver,
    score: state.fighters[0].score,
    grade: state.grade,
    bout: state.bout,
    boutWinner: state.boutWinner,
    p2Score: state.fighters[1].score,
  };
}

export function Game() {
  const stateRef = useRef<GameState>(createInitialState({ demo: true }));
  const [ui, setUi] = useState<UiSnapshot>(() => snapshot(stateRef.current));
  const [isMuted, setIsMuted] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [hasPaid, setHasPaid] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [lightningInvoice, setLightningInvoice] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [invoiceCopied, setInvoiceCopied] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTimeLeft, setFreePlayTimeLeft] = useState(60);
  const [gameEndReason, setGameEndReason] = useState<'match' | 'timeout' | null>(null);
  const freePlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [twoPlayer, setTwoPlayer] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showLoginToSave, setShowLoginToSave] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [showAddAccountDialog, setShowAddAccountDialog] = useState(false);
  const [bannerText, setBannerText] = useState<string | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioUnlockedRef = useRef(false);
  const highScoreRef = useRef<number>(0);
  const flashRef = useRef<{ who: 0 | 1 | null; until: number }>({ who: null, until: 0 });
  const p1KeysRef = useRef<KeyState>(emptyKeys());
  const p2KeysRef = useRef<KeyState>(emptyKeys());
  const touchDirRef = useRef<JoystickDirection>({ x: 0, y: 0 });
  const touchFireRef = useRef(false);
  const isPausedRef = useRef(false);
  const hasStartedRef = useRef(false);
  const isMutedRef = useRef(false);
  const bannerTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { user, picture, name } = useCurrentUser();
  const { logout } = useLoginActions();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const orientation = useOrientation();
  const [canvasScale, setCanvasScale] = useState(1);
  const [sideMargin, setSideMargin] = useState(0);
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const { mutate: publishEvent } = useNostrPublish();
  const { data: leaderboard, refetch: refetchLeaderboard, isLoading: leaderboardLoading, error: leaderboardError } = useGameScores(50, showLeaderboard);
  const { toast } = useToast();
  const wallet = useWallet();
  const { sendPayment, getActiveConnection } = useNWC();
  const [highlightedScore, setHighlightedScore] = useState<number | null>(null);
  const [hasPublishedScore, setHasPublishedScore] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const checkIsStandalone = () => {
    if (typeof window === 'undefined') return false;
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    const fullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    return standalone || fullscreen || iosStandalone;
  };

  const [isStandalone] = useState(checkIsStandalone);
  const [pwaPromptDismissed, setPwaPromptDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('pwa-prompt-dismissed') === 'true';
  });
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(navigator.userAgent);
  const isDevToolsEmulation = window.location.hostname === 'localhost';
  const isRealMobileDevice = (isIOS || isAndroid) && !isDevToolsEmulation;

  useEffect(() => {
    fistAudio.setupAutoUnlock();
    // Browsers only allow sound after the first click/key: from then on the attract demo has music and shouts
    const unlock = () => { audioUnlockedRef.current = true; setAudioUnlocked(true); };
    ['mousedown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, unlock, { capture: true, once: true }));
    try {
      highScoreRef.current = parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0', 10) || 0;
    } catch {
      highScoreRef.current = 0;
    }
  }, []);

  // Keep the local high score in step with the Nostr leaderboard
  useEffect(() => {
    if (leaderboard && leaderboard.length > 0 && leaderboard[0].score > highScoreRef.current) {
      highScoreRef.current = leaderboard[0].score;
      try { localStorage.setItem(HIGH_SCORE_KEY, String(leaderboard[0].score)); } catch { /* ignore */ }
    }
  }, [leaderboard]);

  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { hasStartedRef.current = hasStarted; }, [hasStarted]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // LNbits payment hook - creates invoices via LNURL and polls for payment
  const {
    createInvoice: createLNbitsInvoice,
    isPaid: paymentConfirmed,
    isPolling,
    reset: resetPayment,
  } = useLNbitsPayment({
    lightningAddress: RECIPIENT_LIGHTNING_ADDRESS,
    lnbitsUrl: LNBITS_URL,
    apiKey: LNBITS_INVOICE_KEY,
    onPaid: () => {
      setHasPaid(true);
      setLightningInvoice(null);
      setQrCodeDataUrl(null);
    },
  });

  const showBanner = useCallback((text: string, ms = 1800) => {
    if (!hasStartedRef.current) return;
    setBannerText(text);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => setBannerText(null), ms);
  }, []);

  const handleEvents = useCallback((events: GameEvent[], state: GameState) => {
    const muted = isMutedRef.current;
    for (const e of events) {
      switch (e.type) {
        case 'kiai': if (!muted) fistAudio.playKiai((e.who ?? 0) + Math.floor(state.frameCount / 7) % 2); break;
        case 'whoosh': if (!muted) fistAudio.playWhoosh(); break;
        case 'crack':
          if (!muted) fistAudio.playCrack(!!e.full);
          flashRef.current = { who: e.who === 0 ? 1 : 0, until: performance.now() + 160 };
          break;
        case 'thud': if (!muted) fistAudio.playThud(); break;
        case 'block': if (!muted) fistAudio.playBlock(); break;
        case 'point':
          if (!muted) fistAudio.playPoint(!!e.full);
          showBanner(e.full ? 'FULL POINT' : 'HALF POINT', 900);
          break;
        case 'tick': if (!muted) fistAudio.playTick(); break;
        case 'time_bonus': if (!muted) fistAudio.playBonusTick(); break;
        case 'bout_won':
          if (!muted) fistAudio.playWin();
          break;
        case 'bout_lost':
          if (!muted) fistAudio.playDefeat();
          break;
        case 'promotion':
          if (!muted) fistAudio.playPromotion();
          showBanner(`PROMOTED TO ${gradeName(state.grade)}`, 2500);
          break;
        case 'gallop': if (!muted) fistAudio.playGallop(); break;
        case 'bull_down': if (!muted) fistAudio.playBullDown(); break;
        case 'bull_bonus':
          if (!muted) fistAudio.playPoint(true);
          showBanner(`BULL BONUS ${e.amount}`, 2000);
          break;
        case 'game_over':
          fistAudio.stopMusic();
          if (!muted) fistAudio.playDefeat();
          setGameEndReason((prev) => prev || 'match');
          break;
      }
    }
  }, [showBanner]);

  const stopGame = useCallback(() => {
    fistAudio.stopMusic();
    if (freePlayTimerRef.current) {
      clearInterval(freePlayTimerRef.current);
      freePlayTimerRef.current = null;
    }
    setHasStarted(false);
    setIsPaused(false);
    stateRef.current = createInitialState({ demo: true, seed: Date.now() & 0xffff });
    setUi(snapshot(stateRef.current));
  }, []);

  // Fixed-step game loop (60 Hz). Runs the attract-mode demo when no game is active.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const stepMs = 1000 / FRAME_RATE;

    const loop = (now: number) => {
      acc += Math.min(100, now - last);
      last = now;
      let uiChanged = false;
      while (acc >= stepMs) {
        acc -= stepMs;
        const state = stateRef.current;
        if (isPausedRef.current) continue;

        let in1: FighterInput = NEUTRAL_INPUT;
        let in2: FighterInput = NEUTRAL_INPUT;
        if (hasStartedRef.current) {
          const pad1 = gamepadInput(0);
          const k1 = keysToInput(p1KeysRef.current);
          const touch: FighterInput = { dir: touchDirRef.current, fire: touchFireRef.current };
          in1 = pad1 && (pad1.dir.x || pad1.dir.y || pad1.fire) ? pad1
            : k1.dir.x || k1.dir.y || k1.fire ? k1
            : touch;
          const pad2 = gamepadInput(1);
          const k2 = keysToInput(p2KeysRef.current);
          in2 = pad2 && (pad2.dir.x || pad2.dir.y || pad2.fire) ? pad2 : k2;
        }

        const prevPhase = state.phase;
        const prevScore = state.fighters[0].score;
        const prevGrade = state.grade;
        updateGame(state, [in1, in2]);
        if ((hasStartedRef.current || audioUnlockedRef.current) && state.events.length) handleEvents(state.events, state);
        if (state.phase !== prevPhase || state.fighters[0].score !== prevScore || state.grade !== prevGrade || state.gameOver) {
          uiChanged = true;
        }
        if (hasStartedRef.current && !state.demo && state.fighters[0].score > highScoreRef.current) {
          highScoreRef.current = state.fighters[0].score;
          try { localStorage.setItem(HIGH_SCORE_KEY, String(highScoreRef.current)); } catch { /* ignore */ }
        }
      }
      if (uiChanged) setUi(snapshot(stateRef.current));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [handleEvents]);

  // Music: the oriental title tune over the attract demo, the slower in-game tune while fighting
  useEffect(() => {
    if (isMuted || isPaused || (hasStarted && ui.gameOver)) {
      fistAudio.stopMusic();
      return;
    }
    if (!hasStarted) {
      if (audioUnlocked) fistAudio.startMusic('title');
      return () => fistAudio.stopMusic();
    }
    fistAudio.startMusic('game');
    return () => fistAudio.stopMusic();
  }, [hasStarted, ui.gameOver, isPaused, isMuted, audioUnlocked]);

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && showPayment && hasPaid) {
        e.preventDefault();
        setShowPayment(false);
        startGame();
        return;
      }

      if (hasStarted && isPaused && !ui.gameOver && e.key !== 'Escape') {
        e.preventDefault();
        setIsPaused(false);
        return;
      }

      if (e.key === 'Escape' && hasStarted && !ui.gameOver) {
        e.preventDefault();
        setIsPaused((p) => !p);
        return;
      }

      const p1 = P1_KEYS[e.key];
      const p2 = P2_KEYS[e.key];
      if (p1) { e.preventDefault(); p1KeysRef.current[p1] = true; }
      if (p2 && twoPlayer) { e.preventDefault(); p2KeysRef.current[p2] = true; }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const p1 = P1_KEYS[e.key];
      const p2 = P2_KEYS[e.key];
      if (p1) p1KeysRef.current[p1] = false;
      if (p2) p2KeysRef.current[p2] = false;
    };

    const clearKeys = () => {
      p1KeysRef.current = emptyKeys();
      p2KeysRef.current = emptyKeys();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearKeys);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearKeys);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted, ui.gameOver, isPaused, showPayment, hasPaid, twoPlayer]);

  // Pause when dialogs are open
  useEffect(() => {
    if ((showLeaderboard || showHowToPlay || showShareDialog || showAddAccountDialog) && hasStarted && !ui.gameOver && !isPaused) {
      setIsPaused(true);
    }
  }, [showLeaderboard, showHowToPlay, showShareDialog, showAddAccountDialog, hasStarted, ui.gameOver, isPaused]);

  // Scale the canvas to fit the viewport
  useEffect(() => {
    const calculateScale = () => {
      if (!gameContainerRef.current) return;
      const container = gameContainerRef.current;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const canvasWidth = CANVAS_WIDTH + 8;
      const canvasHeight = CANVAS_HEIGHT + 8;
      const padding = isMobile ? 8 : 32;
      const scaleX = (containerWidth - padding) / canvasWidth;
      const scaleY = (containerHeight - padding) / canvasHeight;
      const scale = Math.min(scaleX, scaleY, 1.5);
      const finalScale = Math.max(0.3, scale);
      setCanvasScale(finalScale);
      const scaledCanvasWidth = canvasWidth * finalScale;
      setSideMargin(Math.max(0, (containerWidth - scaledCanvasWidth) / 2));
    };

    calculateScale();
    const timeoutId = setTimeout(calculateScale, 100);
    const rafId = requestAnimationFrame(calculateScale);
    window.addEventListener('resize', calculateScale);
    return () => {
      window.removeEventListener('resize', calculateScale);
      clearTimeout(timeoutId);
      cancelAnimationFrame(rafId);
    };
  }, [orientation, pwaPromptDismissed, isMobile]);

  const handleWalletPayment = async () => {
    if (!wallet) {
      toast({ title: 'No wallet connected', description: 'Please connect a Lightning wallet or use invoice payment', variant: 'destructive' });
      return;
    }
    setIsPaymentProcessing(true);
    try {
      const invoice = await createLNbitsInvoice(GAME_COST_SATS, 'Exploding Sats - 21 sats to play');

      const nwcConnection = getActiveConnection();
      if (nwcConnection && nwcConnection.isConnected) {
        try {
          await sendPayment(nwcConnection, invoice);
          setHasPaid(true);
          resetPayment();
          toast({ title: 'Payment successful! ⚡', description: `Paid ${GAME_COST_SATS} sats via NWC to play` });
          return;
        } catch (nwcError) {
          console.error('NWC payment failed:', nwcError);
        }
      }

      if (typeof window.webln !== 'undefined') {
        await window.webln.enable();
        await window.webln.sendPayment(invoice);
        setHasPaid(true);
        resetPayment();
        toast({ title: 'Payment successful! ⚡', description: `Paid ${GAME_COST_SATS} sats to play` });
        return;
      }

      toast({ title: 'No wallet available', description: 'Please use the invoice payment option or connect a wallet', variant: 'destructive' });
    } catch (error) {
      toast({ title: 'Payment failed', description: error instanceof Error ? error.message : 'Please try again', variant: 'destructive' });
    } finally {
      setIsPaymentProcessing(false);
    }
  };

  const handleGenerateInvoice = async () => {
    setIsPaymentProcessing(true);
    try {
      const invoice = await createLNbitsInvoice(GAME_COST_SATS, 'Exploding Sats - 21 sats to play');
      setLightningInvoice(invoice);
      const qrDataUrl = await QRCode.toDataURL(invoice.toUpperCase(), {
        errorCorrectionLevel: 'L',
        margin: 2,
        width: 300,
        color: { dark: '#f59e0b', light: '#000000' },
      });
      setQrCodeDataUrl(qrDataUrl);
      toast({ title: 'Invoice generated! ⚡', description: 'Scan the QR code or copy the invoice to pay' });
    } catch (error) {
      toast({ title: 'Failed to generate invoice', description: error instanceof Error ? error.message : 'Please try again', variant: 'destructive' });
    } finally {
      setIsPaymentProcessing(false);
    }
  };

  const copyInvoice = async () => {
    if (!lightningInvoice) return;
    try {
      await navigator.clipboard.writeText(lightningInvoice);
      setInvoiceCopied(true);
      toast({ title: 'Invoice copied!', description: 'Paste it in your Lightning wallet to pay' });
      setTimeout(() => setInvoiceCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', description: 'Please try again', variant: 'destructive' });
    }
  };

  const startGame = (freeMode = false) => {
    if (!freeMode && !hasPaid) {
      setShowPayment(true);
      return;
    }
    if (!freeMode && hasPaid) {
      setHasPaid(false);
    }

    if (freeMode) {
      setIsFreePlay(true);
      setFreePlayTimeLeft(60);
      if (freePlayTimerRef.current) clearInterval(freePlayTimerRef.current);
      freePlayTimerRef.current = setInterval(() => {
        if (isPausedRef.current) return;
        setFreePlayTimeLeft((prev) => {
          if (prev <= 1) {
            if (freePlayTimerRef.current) {
              clearInterval(freePlayTimerRef.current);
              freePlayTimerRef.current = null;
            }
            fistAudio.stopMusic();
            if (!isMutedRef.current) fistAudio.playDefeat();
            setGameEndReason('timeout');
            stateRef.current.gameOver = true;
            stateRef.current.phase = 'game_over';
            setUi(snapshot(stateRef.current));
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setIsFreePlay(false);
      if (freePlayTimerRef.current) {
        clearInterval(freePlayTimerRef.current);
        freePlayTimerRef.current = null;
      }
    }

    fistAudio.initialize();
    p1KeysRef.current = emptyKeys();
    p2KeysRef.current = emptyKeys();
    stateRef.current = createInitialState({ twoPlayer, seed: Date.now() & 0xffff });
    setUi(snapshot(stateRef.current));
    setHasStarted(true);
    setIsPaused(false);
    setHasPublishedScore(false);
    setHighlightedScore(null);
    setGameEndReason(null);
    showBanner(twoPlayer ? 'BOUT 1' : 'NOVICE - BOUT 1', 2000);
  };

  const togglePause = () => setIsPaused((p) => !p);

  const pauseForDialog = () => {
    if (hasStarted && !ui.gameOver && !isPaused) setIsPaused(true);
  };

  const toggleMute = () => {
    const muted = fistAudio.toggleMute();
    setIsMuted(muted);
  };

  const handleTouchDirection = useCallback((direction: JoystickDirection) => {
    touchDirRef.current = direction;
  }, []);

  const handleTouchFire = useCallback((pressed: boolean) => {
    touchFireRef.current = pressed;
  }, []);

  const publishScore = useCallback(async () => {
    if (!user) {
      setShowLoginToSave(true);
      return;
    }
    if (isPublishing || hasPublishedScore) return;

    setIsPublishing(true);
    const scoreToPublish = ui.score;
    try {
      const response = await fetch('/api/publish-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerPubkey: user.pubkey, score: scoreToPublish, level: ui.grade }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to publish score');
      }
      toast({ title: 'Score saved! 🥋', description: `Your score of ${scoreToPublish.toLocaleString()} has been added to the leaderboard` });
      setHasPublishedScore(true);
      setHighlightedScore(scoreToPublish);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['game-scores'] });
        refetchLeaderboard();
        setShowLeaderboard(true);
      }, 1000);
    } catch (err) {
      toast({ title: 'Failed to save score', description: err instanceof Error ? err.message : 'Please try again', variant: 'destructive' });
    } finally {
      setIsPublishing(false);
    }
  }, [user, ui.score, ui.grade, toast, queryClient, refetchLeaderboard, isPublishing, hasPublishedScore]);

  const openShareDialog = useCallback(() => {
    const grade = gradeName(ui.grade);
    const score = ui.score.toLocaleString();
    const funMessages = [
      `🥋 HI-YA! Just scored ${score} points and reached ${grade} in Way of the Exploding Sats! ⚡ Think you can take me on the mat?\n\n${SITE_URL}\n\n#ExplodingSats #ExplodingFist`,
      `⚡ ${score} points, graded ${grade}. Full yin-yangs all the way! 🥋 Pay 21 sats and prove yourself.\n\n${SITE_URL}\n\n#ExplodingSats #Karate`,
      `🥋 The sensei bowed. ${score} points at ${grade} in Way of the Exploding Sats. Your move.\n\n${SITE_URL}\n\n#ExplodingSats #ExplodingFist`,
      `⚡ Flying kick for the full point! ${score} points and ${grade} in Way of the Exploding Sats 🥋\n\n${SITE_URL}\n\n#ExplodingSats #Retro`,
    ];
    setShareMessage(funMessages[Math.floor(Math.random() * funMessages.length)]);
    setShowShareDialog(true);
  }, [ui.score, ui.grade]);

  const publishSharePost = useCallback(() => {
    if (!user) {
      toast({ title: 'Login required', description: 'Please login to share on Nostr', variant: 'destructive' });
      return;
    }
    publishEvent({
      kind: 1,
      content: shareMessage,
      tags: [
        ['t', 'explodingsats'],
        ['t', 'gaming'],
        ['t', 'nostr'],
        ['r', SITE_URL],
      ],
    });
    toast({ title: 'Posted to Nostr! 🥋', description: 'Your score has been shared with the world' });
    setShowShareDialog(false);
  }, [user, shareMessage, publishEvent, toast]);

  const copyShareMessage = useCallback(() => {
    navigator.clipboard.writeText(shareMessage);
    toast({ title: 'Copied!', description: 'Message copied to clipboard' });
  }, [shareMessage, toast]);

  if (isMobile && orientation === 'portrait') {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-amber-400 p-6" style={{ paddingBottom: 'env(safe-area-inset-bottom)', minHeight: '100dvh' }}>
        <RotateCcw className="w-20 h-20 mb-6 animate-pulse text-amber-300" />
        <h1 className="text-2xl font-bold text-center mb-3">ROTATE YOUR DEVICE</h1>
        <p className="text-lg text-amber-200 text-center">Turn your device sideways to fight</p>
      </div>
    );
  }

  if (isRealMobileDevice && !isStandalone && !pwaPromptDismissed) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-amber-400 p-6">
        <div className="text-6xl mb-6">📱</div>
        <h1 className="text-2xl font-bold text-center mb-3 text-red-400">ADD TO HOME SCREEN</h1>
        <p className="text-lg text-amber-200 text-center mb-6">For the best fullscreen experience</p>
        <div className="bg-red-900/50 border border-red-500 rounded-lg p-5 mb-8 max-w-sm">
          <p className="text-red-100 text-base text-center">
            {isIOS ? (
              <>Tap <strong>Share</strong> <span className="text-xl">⬆</span> then <strong>Add to Home Screen</strong></>
            ) : isAndroid ? (
              <>Tap <strong>⋮ Menu</strong> then <strong>Add to Home Screen</strong> or <strong>Install App</strong></>
            ) : (
              <>Use your browser menu to <strong>Add to Home Screen</strong> or <strong>Install</strong></>
            )}
          </p>
        </div>
        <button
          onClick={() => {
            fistAudio.initialize();
            setPwaPromptDismissed(true);
            sessionStorage.setItem('pwa-prompt-dismissed', 'true');
          }}
          className="text-amber-600 hover:text-amber-400 text-sm underline"
        >
          Continue without installing →
        </button>
      </div>
    );
  }

  const dialogClass = `bg-gray-900 border-amber-500 text-amber-400 border-4 ${isMobile ? 'max-w-[85vw] max-h-[80vh] overflow-y-auto p-3 mx-auto' : 'max-w-md'}`;
  const outlineBtn = 'border-amber-500 text-amber-400 hover:bg-amber-500 hover:text-black';
  const playerWon = ui.boutWinner === 0;

  return (
    <div className="fixed inset-0 bg-black text-amber-400 overflow-hidden flex flex-col">
      {/* CRT scanline overlay */}
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(255,180,60,0.035)_50%)] bg-[length:100%_4px] z-50" />

      {/* Header */}
      <div
        className={`relative z-10 bg-black border-b-2 border-amber-500 flex justify-between items-center ${isMobile ? 'px-4 py-1' : 'px-6 py-3'}`}
        style={isMobile ? { paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' } : undefined}
      >
        <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-6'}`}>
          <h1 className={`font-bold tracking-wider text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.8)] ${isMobile ? 'text-xl' : 'text-4xl'}`}>
            {isMobile ? 'EXPLODING SATS' : 'WAY OF THE EXPLODING SATS'}
          </h1>
          <div className={`bg-red-600 text-white rounded font-bold ${isMobile ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'}`}>
            ⚡ 21 SATS
          </div>
        </div>

        <div className={`flex items-center ${isMobile ? 'gap-1' : 'gap-2'}`}>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="focus:outline-none">
                  <Avatar className={`border-2 border-amber-500 cursor-pointer hover:border-amber-300 transition-colors ${isMobile ? 'h-6 w-6' : 'h-9 w-9'}`}>
                    <AvatarImage src={picture} alt={name || 'User'} />
                    <AvatarFallback className="bg-amber-900 text-amber-300 text-xs">
                      {(name || user.pubkey.slice(0, 2)).toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-gray-900 border-amber-500">
                <WalletModal>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-amber-400 hover:text-amber-300 hover:bg-amber-900/20 cursor-pointer text-lg py-3">
                    <Wallet className="mr-2 h-5 w-5" />
                    Wallet Settings
                  </DropdownMenuItem>
                </WalletModal>
                <DropdownMenuItem onClick={() => { pauseForDialog(); setShowAddAccountDialog(true); }} className="text-amber-400 hover:text-amber-300 hover:bg-amber-900/20 cursor-pointer text-lg py-3">
                  <UserPlus className="mr-2 h-5 w-5" />
                  Add Account
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout} className="text-red-400 hover:text-red-300 hover:bg-red-900/20 cursor-pointer text-lg py-3">
                  <LogOut className="mr-2 h-5 w-5" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <LoginArea isMobile={isMobile} onDialogOpen={pauseForDialog} />
          )}

          <Button variant="outline" onClick={() => setShowLeaderboard(true)} className={`${outlineBtn} ${isMobile ? 'h-6 px-2 text-xs' : 'h-9 px-3'}`}>
            <Trophy className={isMobile ? 'mr-1 h-3 w-3' : 'mr-2 h-4 w-4'} />
            LEADERBOARD
          </Button>

          <Button variant="outline" onClick={() => setShowHowToPlay(true)} className={`${outlineBtn} ${isMobile ? 'h-6 px-2 text-xs' : 'h-9 px-3'}`}>
            <HelpCircle className={isMobile ? 'mr-1 h-3 w-3' : 'mr-2 h-4 w-4'} />
            MOVES
          </Button>

          <Button variant="outline" onClick={toggleMute} className={`p-0 ${outlineBtn} ${isMobile ? 'h-6 w-6' : 'h-9 w-9'}`}>
            {isMuted ? <VolumeX className={isMobile ? 'h-3 w-3' : 'h-4 w-4'} /> : <Volume2 className={isMobile ? 'h-3 w-3' : 'h-4 w-4'} />}
          </Button>

          {hasStarted && !ui.gameOver && !isMobile && (
            <Button variant="outline" onClick={togglePause} className={`h-9 w-9 p-0 ${outlineBtn}`}>
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {isRealMobileDevice && !isStandalone && pwaPromptDismissed && (
        <button
          onClick={async () => {
            if (installPrompt) {
              await installPrompt.prompt();
              const result = await installPrompt.userChoice;
              if (result.outcome === 'accepted') setInstallPrompt(null);
            }
          }}
          className={`absolute top-12 right-2 z-20 bg-red-900/90 border border-red-500 rounded px-2 py-1 text-red-100 text-[10px] max-w-[160px] text-left ${installPrompt ? 'cursor-pointer hover:bg-red-800' : 'cursor-default'}`}
        >
          📱 {installPrompt ? 'Tap to install app' : 'Add to Home Screen for the best experience'}
        </button>
      )}

      {/* Game canvas */}
      <div ref={gameContainerRef} className={`relative z-10 flex-1 flex items-center justify-center bg-black overflow-hidden ${isMobile ? 'p-1' : 'p-4'}`}>
        <div className="relative" style={{ transform: `scale(${canvasScale})`, transformOrigin: 'center center' }}>
          <FistCanvas stateRef={stateRef} highScoreRef={highScoreRef} flashRef={flashRef} running={!isPaused || !hasStarted} />

          {isFreePlay && hasStarted && !ui.gameOver && (
            <div className="absolute top-2 right-2 text-yellow-300 animate-pulse text-lg pointer-events-none" style={{ textShadow: '0 0 4px black, 0 0 8px black' }}>
              FREE - {freePlayTimeLeft}s
            </div>
          )}

          {/* Attract mode overlay */}
          {!hasStarted && !SHOWCASE && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <div className="text-center space-y-5">
                <div className="text-2xl tracking-[0.3em] text-amber-200">THE WAY OF THE</div>
                <div className="text-7xl font-bold leading-none" style={{ color: '#f7931a', textShadow: '4px 4px 0 #7a1d0e' }}>
                  EXPLODING SATS
                </div>
                <div className="text-3xl animate-pulse font-bold text-amber-300">INSERT BITCOIN</div>
                <div className="flex justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTwoPlayer(false)}
                    className={`${!twoPlayer ? 'bg-amber-500 text-black' : ''} ${outlineBtn} text-base px-4`}
                  >
                    <User className="mr-1 h-4 w-4" /> 1 PLAYER
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTwoPlayer(true)}
                    className={`${twoPlayer ? 'bg-amber-500 text-black' : ''} ${outlineBtn} text-base px-4`}
                  >
                    <Users className="mr-1 h-4 w-4" /> 2 PLAYER
                  </Button>
                </div>
                <div className="space-y-3">
                  <Button onClick={() => startGame(false)} size="lg" className="bg-amber-500 text-black hover:bg-amber-400 font-bold text-2xl px-12 py-8 w-full">
                    <Zap className="mr-3 h-8 w-8" />
                    PAY 21 SATS TO FIGHT
                  </Button>
                  <Button onClick={() => startGame(true)} variant="outline" size="sm" className={`${outlineBtn} text-sm px-6 py-3 w-full`}>
                    TRY FREE (1-MIN LIMIT)
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Event banner */}
          {bannerText && hasStarted && !ui.gameOver && (
            <div className="absolute inset-x-0 top-[28%] flex items-center justify-center pointer-events-none z-20">
              <div className="text-5xl font-bold text-white px-6 py-2 bg-black/60 rounded" style={{ textShadow: '3px 3px 0 #000' }}>
                {bannerText}
              </div>
            </div>
          )}

          {/* Pause overlay */}
          {isPaused && hasStarted && !ui.gameOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20 cursor-pointer" onClick={() => setIsPaused(false)}>
              <div className="text-center space-y-6">
                <div className="text-7xl text-yellow-400 font-bold animate-pulse">PAUSED</div>
                <div className="text-2xl text-amber-300 mb-4">{isMobile ? 'TAP TO CONTINUE' : 'PRESS ANY KEY TO CONTINUE'}</div>
                <Button
                  onClick={(e) => { e.stopPropagation(); stopGame(); }}
                  variant="outline"
                  className="border-red-500 text-red-500 hover:bg-red-500 hover:text-black text-lg px-8 py-4"
                >
                  QUIT MATCH
                </Button>
              </div>
            </div>
          )}

          {/* Game over */}
          {ui.gameOver && hasStarted && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90">
              <div className="text-center space-y-6">
                <div className={`text-6xl font-bold animate-pulse mb-4 ${gameEndReason === 'timeout' ? 'text-yellow-500' : twoPlayer ? 'text-amber-400' : 'text-red-500'}`}>
                  {gameEndReason === 'timeout' ? "TIME'S UP!" : twoPlayer ? (ui.score === ui.p2Score ? 'DRAW' : ui.score > ui.p2Score ? 'PLAYER 1 WINS' : 'PLAYER 2 WINS') : 'THE MATCH IS OVER'}
                </div>
                {twoPlayer ? (
                  <div className="text-3xl text-white mb-4">
                    P1 {ui.score.toLocaleString()} &nbsp;•&nbsp; P2 {ui.p2Score.toLocaleString()}
                  </div>
                ) : (
                  <div className="text-4xl text-white mb-2">
                    FINAL SCORE: {ui.score.toLocaleString()}
                    <div className="text-2xl text-amber-300 mt-2">GRADE: {gradeName(ui.grade)}{playerWon ? '' : ''}</div>
                  </div>
                )}
                <div className="flex flex-col gap-4">
                  <div className="flex gap-4">
                    <Button onClick={() => startGame(false)} size="lg" className="bg-amber-500 text-black hover:bg-amber-400 font-bold text-xl px-8 py-6">
                      <Zap className="mr-2 h-6 w-6" />
                      FIGHT AGAIN (21 SATS)
                    </Button>
                    <Button onClick={() => startGame(true)} variant="outline" size="lg" className={`${outlineBtn} text-lg px-8 py-6`}>
                      TRY FREE (1-MIN)
                    </Button>
                  </div>
                  {!twoPlayer && (
                    <div className="flex gap-4 justify-center">
                      <Button
                        onClick={publishScore}
                        variant="outline"
                        size="lg"
                        disabled={isPublishing || hasPublishedScore || isFreePlay}
                        title={isFreePlay ? 'Scores from free play are not published' : undefined}
                        className={hasPublishedScore
                          ? 'border-amber-500 text-amber-400 text-lg cursor-not-allowed opacity-70'
                          : isPublishing || isFreePlay
                          ? 'border-yellow-500 text-yellow-500 text-lg cursor-not-allowed opacity-70'
                          : 'border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black text-lg'}
                      >
                        <Trophy className="mr-2 h-5 w-5" />
                        {hasPublishedScore ? 'SAVED ✓' : isPublishing ? 'SAVING...' : isFreePlay ? 'PAID GAMES ONLY' : 'SAVE TO LEADERBOARD'}
                      </Button>
                      <Button onClick={openShareDialog} variant="outline" size="lg" className={`${outlineBtn} text-lg`}>
                        <Share2 className="mr-2 h-5 w-5" />
                        SHARE
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Touch controls */}
      {isMobile && hasStarted && !ui.gameOver && !isPaused && (
        <JoystickControls
          onDirection={handleTouchDirection}
          onFire={handleTouchFire}
          onPause={togglePause}
          sideMargin={sideMargin}
        />
      )}

      {/* Footer */}
      {!isMobile && (
        <div className="relative z-10 bg-black border-t-2 border-amber-500 text-center text-amber-600 px-6 py-2 text-lg">
          {hasStarted ? (
            <span>ARROWS: JOYSTICK | SPACE / SHIFT: FIRE (KICKS) | ESC: PAUSE{twoPlayer ? ' | P2: WASD + F' : ''}</span>
          ) : (
            <span>A TRIBUTE TO THE WAY OF THE EXPLODING FIST (1985) • POWERED BY LIGHTNING ⚡</span>
          )}
        </div>
      )}

      {/* Leaderboard */}
      <Dialog open={showLeaderboard} onOpenChange={(open) => {
        setShowLeaderboard(open);
        if (open) {
          queryClient.invalidateQueries({ queryKey: ['game-scores'] });
          refetchLeaderboard();
        }
        if (!open) setHighlightedScore(null);
      }}>
        <DialogContent aria-describedby={undefined} className={dialogClass}>
          <DialogHeader>
            <DialogTitle className={`text-amber-300 flex items-center gap-2 ${isMobile ? 'text-xl' : 'text-3xl'}`}>
              <Trophy className={isMobile ? 'h-5 w-5' : 'h-8 w-8'} />
              HALL OF MASTERS
            </DialogTitle>
          </DialogHeader>
          <div className={`space-y-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-800 [&::-webkit-scrollbar-thumb]:bg-amber-500 [&::-webkit-scrollbar-thumb]:rounded ${isMobile ? 'max-h-[60vh]' : 'max-h-96'}`}>
            {leaderboardLoading ? (
              <div className="text-center text-amber-600 py-12 text-lg">LOADING...</div>
            ) : leaderboardError ? (
              <div className="text-center text-red-500 py-12 text-lg">FAILED TO LOAD SCORES</div>
            ) : leaderboard && leaderboard.length > 0 ? (
              leaderboard.map((score, index) => {
                const isCurrentUser = user && score.pubkey === user.pubkey;
                const isHighlighted = isCurrentUser && highlightedScore === score.score;
                return (
                  <div
                    key={score.event.id}
                    ref={isHighlighted ? (el) => {
                      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                    } : undefined}
                  >
                    <LeaderboardEntry score={score} index={index} isCurrentUser={!!isCurrentUser} isHighlighted={!!isHighlighted} currentUserName={name} />
                  </div>
                );
              })
            ) : (
              <div className="text-center text-amber-600 py-12 text-lg">NO SCORES YET. BE THE FIRST!</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Moves */}
      <Dialog open={showHowToPlay} onOpenChange={setShowHowToPlay}>
        <DialogContent aria-describedby={undefined} className={`${dialogClass} ${isMobile ? '' : 'max-w-2xl'}`}>
          <DialogHeader>
            <DialogTitle className={`text-amber-300 flex items-center gap-2 ${isMobile ? 'text-xl' : 'text-3xl'}`}>
              <HelpCircle className={isMobile ? 'h-5 w-5' : 'h-8 w-8'} />
              THE WAY OF THE FIST
            </DialogTitle>
          </DialogHeader>
          <div className={`text-amber-200 ${isMobile ? 'space-y-2 text-sm' : 'space-y-4 text-lg'}`}>
            <p>Pay 21 sats to fight. Every clean blow knocks your opponent down for a full yin-yang; a scrappy one earns half. First to two full points wins the bout. Win two bouts to be graded up a Dan and move to a new arena. Lose a bout and the match is over. Remaining seconds pay 100 points each.</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono">
              <div className="text-amber-400 font-bold col-span-2 border-b border-amber-700 pb-1">JOYSTICK ONLY (ARROWS)</div>
              <span>▲ Jump</span><span>▼ Crouch</span>
              <span>▶ Walk forward</span><span>◀ Walk back / block</span>
              <span>◤ Forward somersault</span><span>◣ Backward somersault</span>
              <span>◥ High punch</span><span>◢ Jab punch</span>
              <span className="col-span-2">▼ then ◢ Low punch (from a crouch)</span>
              <div className="text-amber-400 font-bold col-span-2 border-b border-amber-700 pb-1 mt-2">WITH FIRE (SPACE / SHIFT)</div>
              <span>▲ Flying kick</span><span>◥ High kick</span>
              <span>▶ Mid kick</span><span>◢ Short jab kick</span>
              <span>▼ Forward sweep</span><span>◣ Backward sweep</span>
              <span>◀ Roundhouse (hold)</span><span>◀ About-face (release early)</span>
              <span>◤ High back kick</span><span>FIRE alone: about-face</span>
            </div>
            <p className="text-amber-500 text-base">Directions are relative to the way you face. Sweeps can't be blocked - jump them. Duck the flying kick. Gamepads work too: stick or D-pad plus any button. After the fourth arena a bull charges in: somersault over it, or stop it with a low punch on the nose.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment */}
      <Dialog open={showPayment} onOpenChange={(open) => {
        setShowPayment(open);
        if (!open) {
          setLightningInvoice(null);
          setQrCodeDataUrl(null);
          setInvoiceCopied(false);
          if (!hasPaid) resetPayment();
        }
      }}>
        <DialogContent className={dialogClass}>
          <DialogHeader>
            <DialogTitle className={isMobile ? 'text-xl' : 'text-3xl'} style={{ color: '#f7931a' }}>INSERT BITCOIN</DialogTitle>
            <DialogDescription className={`text-amber-200 ${isMobile ? 'text-sm' : 'text-lg'}`}>
              SEND 21 SATS VIA LIGHTNING TO FIGHT
            </DialogDescription>
          </DialogHeader>
          <div className={isMobile ? 'space-y-2' : 'space-y-4'}>
            {hasPaid ? (
              <>
                <div className={`text-center ${isMobile ? 'py-2' : 'py-6'}`}>
                  <div className={`font-mono text-amber-300 ${isMobile ? 'text-4xl mb-2' : 'text-7xl mb-4'}`}>[OK]</div>
                  <div className={`font-bold text-amber-300 ${isMobile ? 'text-xl' : 'text-4xl'}`}>PAYMENT RECEIVED!</div>
                  <div className={`text-amber-200 ${isMobile ? 'text-sm mt-2' : 'text-xl mt-4'}`}>21 SATS CONFIRMED</div>
                </div>
                <Button onClick={() => { setShowPayment(false); startGame(); }} className={`w-full bg-amber-500 text-black hover:bg-amber-400 font-bold ${isMobile ? 'text-lg py-4' : 'text-2xl py-8'}`}>
                  <Play className={isMobile ? 'mr-2 h-5 w-5' : 'mr-2 h-8 w-8'} />
                  FIGHT {!isMobile && '(SPACE)'}
                </Button>
              </>
            ) : !lightningInvoice ? (
              <>
                <div className={`text-center ${isMobile ? 'py-2' : 'py-6'}`}>
                  <div className={isMobile ? 'text-4xl mb-2' : 'text-7xl mb-4'}>⚡</div>
                  <div className={`font-bold text-yellow-400 ${isMobile ? 'text-2xl' : 'text-5xl'}`}>21 SATS</div>
                  <div className={`text-amber-600 ${isMobile ? 'text-xs mt-1' : 'text-lg mt-2'}`}>TO {RECIPIENT_LIGHTNING_ADDRESS}</div>
                </div>
                <div className={isMobile ? 'space-y-2' : 'space-y-3'}>
                  {wallet && (
                    <Button onClick={handleWalletPayment} disabled={isPaymentProcessing} className={`w-full bg-amber-500 text-black hover:bg-amber-400 font-bold ${isMobile ? 'text-base py-3' : 'text-xl py-7'}`}>
                      {isPaymentProcessing ? <>PROCESSING...</> : <><Zap className={isMobile ? 'mr-2 h-4 w-4' : 'mr-2 h-6 w-6'} />PAY WITH WALLET</>}
                    </Button>
                  )}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-amber-700" /></div>
                    <div className={`relative flex justify-center uppercase ${isMobile ? 'text-sm' : 'text-base'}`}>
                      <span className="bg-gray-900 px-2 text-amber-600">OR</span>
                    </div>
                  </div>
                  <Button onClick={handleGenerateInvoice} disabled={isPaymentProcessing} variant="outline" className={`w-full ${outlineBtn} font-bold ${isMobile ? 'text-base py-3' : 'text-xl py-7'}`}>
                    {isPaymentProcessing ? <>GENERATING...</> : <>GET LIGHTNING INVOICE</>}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className={isMobile ? 'flex gap-3' : 'text-center space-y-4'}>
                  {qrCodeDataUrl && (
                    <div className={isMobile ? 'flex-shrink-0' : 'flex justify-center'}>
                      <img src={qrCodeDataUrl} alt="Lightning Invoice QR Code" className={`rounded-lg border-4 border-amber-500 ${isMobile ? 'w-[140px] h-[140px]' : ''}`} />
                    </div>
                  )}
                  <div className={isMobile ? 'flex-1 flex flex-col justify-between space-y-1' : ''}>
                    <div className={`text-amber-300 ${isMobile ? 'text-xs' : 'text-lg'}`}>SCAN WITH YOUR LIGHTNING WALLET</div>
                    {paymentConfirmed ? (
                      <div className={`bg-amber-900/30 border border-amber-500 rounded animate-pulse ${isMobile ? 'p-1' : 'p-4'}`}>
                        <div className={`text-amber-300 font-bold ${isMobile ? 'text-sm' : 'text-2xl'}`}>✓ PAYMENT CONFIRMED!</div>
                        <div className={`text-amber-200 ${isMobile ? 'text-[10px] mt-1' : 'text-sm mt-2'}`}>Starting match...</div>
                      </div>
                    ) : (
                      <>
                        <div className={`bg-yellow-900/20 border border-yellow-600 rounded ${isMobile ? 'p-1' : 'p-3'}`}>
                          <div className={`text-yellow-400 animate-pulse ${isMobile ? 'text-[10px]' : 'text-sm'}`}>⏳ WAITING FOR PAYMENT...</div>
                          <div className={`text-yellow-600 mt-1 ${isMobile ? 'text-[8px]' : 'text-xs'}`}>{isPolling ? 'Auto-detecting payment' : 'Checking...'}</div>
                        </div>
                        <div className={`bg-black rounded border border-amber-700 ${isMobile ? 'p-1' : 'p-3'}`}>
                          <div className={`text-amber-500 break-all ${isMobile ? 'text-[8px]' : 'text-xs'}`}>{lightningInvoice.slice(0, isMobile ? 80 : 60)}...</div>
                        </div>
                      </>
                    )}
                    <Button onClick={copyInvoice} variant="outline" className={`${outlineBtn} ${isMobile ? 'text-xs py-1 w-full' : 'w-full text-lg py-5'}`}>
                      {invoiceCopied ? <><Check className={isMobile ? 'mr-1 h-3 w-3' : 'mr-2 h-5 w-5'} />COPIED!</> : <><Copy className={isMobile ? 'mr-1 h-3 w-3' : 'mr-2 h-5 w-5'} />COPY</>}
                    </Button>
                  </div>
                </div>
                <Button onClick={() => { setLightningInvoice(null); setQrCodeDataUrl(null); }} variant="ghost" className={`w-full text-amber-600 hover:text-amber-400 ${isMobile ? 'text-xs mt-1' : 'text-lg'}`}>
                  ← BACK
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Login to save score */}
      <Dialog open={showLoginToSave} onOpenChange={setShowLoginToSave}>
        <DialogContent className={dialogClass}>
          <DialogHeader>
            <DialogTitle className="text-3xl text-amber-300 flex items-center gap-2">
              <Trophy className="h-8 w-8" />
              SAVE YOUR SCORE
            </DialogTitle>
            <DialogDescription className="text-amber-200 text-lg">
              Login with Nostr to save your score of {ui.score.toLocaleString()} to the leaderboard
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="text-center">
              <div className="text-5xl font-bold text-yellow-400 mb-2">{ui.score.toLocaleString()}</div>
              <div className="text-xl text-amber-600">{gradeName(ui.grade)}</div>
            </div>
            <div className="flex flex-col items-center gap-4">
              <LoginArea className="w-full" />
              {user && (
                <Button
                  onClick={() => { publishScore(); setShowLoginToSave(false); }}
                  disabled={isPublishing || hasPublishedScore}
                  className={`w-full font-bold text-xl py-6 ${isPublishing || hasPublishedScore ? 'bg-gray-500 text-gray-300 cursor-not-allowed' : 'bg-yellow-500 text-black hover:bg-yellow-400'}`}
                >
                  <Trophy className="mr-2 h-6 w-6" />
                  {hasPublishedScore ? 'SAVED ✓' : isPublishing ? 'SAVING...' : 'SAVE TO LEADERBOARD'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className={`${dialogClass} ${isMobile ? '' : 'max-w-lg'}`}>
          <DialogHeader>
            <DialogTitle className={`text-amber-300 flex items-center gap-2 ${isMobile ? 'text-xl' : 'text-3xl'}`}>
              <Share2 className={isMobile ? 'h-5 w-5' : 'h-8 w-8'} />
              SHARE YOUR VICTORY
            </DialogTitle>
            <DialogDescription className={`text-amber-200 ${isMobile ? 'text-sm' : 'text-lg'}`}>Tell the world about your grading!</DialogDescription>
          </DialogHeader>
          <div className={isMobile ? 'space-y-2 py-2' : 'space-y-4 py-4'}>
            <textarea
              value={shareMessage}
              onChange={(e) => setShareMessage(e.target.value)}
              className={`w-full bg-black border-2 border-amber-500 rounded-lg text-amber-200 resize-none focus:outline-none focus:border-amber-300 ${isMobile ? 'h-24 p-2 text-sm' : 'h-40 p-4 text-lg'}`}
              placeholder="Write your message..."
            />
            <div className="flex gap-2">
              {user ? (
                <Button onClick={publishSharePost} className={`flex-1 bg-purple-600 text-white hover:bg-purple-500 font-bold ${isMobile ? 'text-sm py-3' : 'text-xl py-6'}`}>
                  <Zap className={isMobile ? 'mr-1 h-4 w-4' : 'mr-2 h-6 w-6'} />
                  POST TO NOSTR
                </Button>
              ) : (
                <div className="flex-1 space-y-2">
                  <div className={`text-center text-yellow-400 ${isMobile ? 'text-xs' : 'text-sm'}`}>Login to post directly to Nostr</div>
                  <LoginArea className="w-full" />
                </div>
              )}
              <Button onClick={copyShareMessage} variant="outline" className={`${outlineBtn} font-bold ${isMobile ? 'text-sm py-3' : 'text-lg py-6'}`}>
                <Copy className={isMobile ? 'mr-1 h-4 w-4' : 'mr-2 h-5 w-5'} />
                COPY
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <LoginDialog isOpen={showAddAccountDialog} onClose={() => setShowAddAccountDialog(false)} onLogin={() => setShowAddAccountDialog(false)} />
    </div>
  );
}
