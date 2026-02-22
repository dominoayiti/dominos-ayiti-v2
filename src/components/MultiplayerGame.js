import React, { useState, useEffect, useCallback } from 'react';
import { User, Coins, ArrowLeft, RotateCcw, Skull, Trophy } from 'lucide-react';
import { database } from '../firebase-config';
import { ref, set, onValue, update, get, remove } from 'firebase/database';

// ─── CONSTANTES ────────────────────────────────────────────────────────────────
const generateDeck = () => {
  const deck = [];
  for (let i = 0; i <= 6; i++)
    for (let j = i; j <= 6; j++)
      deck.push({ v1: i, v2: j, id: `${i}-${j}-${Math.random()}` });
  return deck;
};

const shuffleDeck = (deck) => {
  let d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
};

// Calcule la somme des points dans une main (pour départager en cas de blocage)
const sumHand = (hand) => (hand || []).reduce((s, t) => s + t.v1 + t.v2, 0);

// ─── COMPOSANT DOMINO ──────────────────────────────────────────────────────────
const DotGrid = ({ value }) => {
  // Positions des points selon la valeur (grille 3x3)
  const patterns = {
    0: [],
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const dots = patterns[value] || [];
  return (
    <div className="grid grid-cols-3 gap-[1px] w-full h-full p-[2px]">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="flex items-center justify-center">
          {dots.includes(i) && (
            <div className="w-[5px] h-[5px] rounded-full bg-gray-800" />
          )}
        </div>
      ))}
    </div>
  );
};

const DominoTile = ({ tile, onClick, disabled, highlight, mini }) => {
  const size = mini
    ? 'w-8 h-16 text-[7px]'
    : 'w-12 h-24';
  const dotSize = mini ? 'w-[14px] h-[14px]' : 'w-[26px] h-[26px]';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${size} relative flex flex-col rounded-lg border-2 shadow-md
        transition-all duration-150 select-none overflow-hidden
        ${disabled
          ? 'border-gray-300 bg-gray-50 cursor-default opacity-70'
          : highlight
          ? 'border-yellow-400 bg-white cursor-pointer hover:scale-110 hover:-translate-y-1 shadow-yellow-200/60 shadow-lg'
          : 'border-gray-300 bg-white cursor-pointer hover:scale-105 hover:-translate-y-0.5'
        }
      `}
    >
      {/* Demi-tuile supérieure */}
      <div className={`flex-1 flex items-center justify-center ${dotSize}`}>
        <DotGrid value={tile.v1} />
      </div>
      {/* Séparateur */}
      <div className="h-px bg-gray-400 mx-1 shrink-0" />
      {/* Demi-tuile inférieure */}
      <div className={`flex-1 flex items-center justify-center ${dotSize}`}>
        <DotGrid value={tile.v2} />
      </div>
      {/* Double highlight glow */}
      {highlight && !disabled && (
        <div className="absolute inset-0 rounded-lg ring-2 ring-yellow-400 ring-opacity-70 pointer-events-none" />
      )}
    </button>
  );
};

// ─── COMPOSANT PRINCIPAL ───────────────────────────────────────────────────────
const MultiplayerGame = ({ gameData, currentUser, onExit }) => {
  const [loading, setLoading] = useState(true);
  const [gameState, setGameState] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [result, setResult] = useState(null); // { won: bool, type, amount }
  const [playable, setPlayable] = useState([]); // indices de tuiles jouables

  const gameRef = ref(database, `games/${gameData.sessionId}`);

  // ─── INIT ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const initGame = async () => {
      // Seulement le joueur 1 (hôte) initialise
      if (currentUser.uid !== gameData.player1Uid) return;

      const snap = await get(gameRef);
      if (snap.exists()) return;

      const deck = shuffleDeck(generateDeck());
      const p1Hand = deck.slice(0, 7);
      const p2Hand = deck.slice(7, 14);
      const remaining = deck.slice(14);

      await set(gameRef, {
        status: 'playing',
        board: [],
        deck: remaining,
        turn: gameData.player1Uid,
        lastAction: null,
        consecutivePasses: 0,
        winner: null,
        winType: null,
        startedAt: Date.now(),
        hands: {
          [gameData.player1Uid]: p1Hand,
          [gameData.player2Uid]: p2Hand,
        },
      });
    };

    initGame();
  }, []); // eslint-disable-line

  // ─── ÉCOUTE FIREBASE ────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onValue(gameRef, (snap) => {
      const data = snap.val();
      if (!data) { setLoading(false); return; }

      setLoading(false);
      setGameState(data);

      if (data.hands?.[currentUser.uid]) {
        setMyHand(data.hands[currentUser.uid]);
      }

      // ── Détection fin de partie ──
      if (data.status === 'finished' && data.winner && !result) {
        const iWon = data.winner === currentUser.uid;
        setResult({ won: iWon, type: data.winType, amount: parseInt(gameData.bet) });
      }
    });

    return () => unsub();
  }, [gameRef, currentUser.uid]); // eslint-disable-line

  // ─── CALCUL TUILES JOUABLES ──────────────────────────────────────────────
  useEffect(() => {
    if (!gameState || !myHand.length) { setPlayable([]); return; }
    const board = gameState.board || [];
    if (board.length === 0) {
      setPlayable(myHand.map((_, i) => i));
      return;
    }
    const leftEnd = board[0].v1;
    const rightEnd = board[board.length - 1].v2;
    const indices = myHand
      .map((t, i) => (t.v1 === leftEnd || t.v2 === leftEnd || t.v1 === rightEnd || t.v2 === rightEnd ? i : -1))
      .filter((i) => i !== -1);
    setPlayable(indices);
  }, [myHand, gameState]);

  // ─── ÉCRIRE LA FIN DE PARTIE ────────────────────────────────────────────
  const finishGame = useCallback(
    async (winnerUid, winType) => {
      try {
        await update(gameRef, {
          status: 'finished',
          winner: winnerUid,
          winType,
          finishedAt: Date.now(),
        });
      } catch (e) {
        console.error('Erreur finishGame:', e);
      }
    },
    [gameRef]
  );

  // ─── JOUER UNE TUILE ────────────────────────────────────────────────────
  const handlePlayTile = async (idx) => {
    const isMyTurn = gameState?.turn === currentUser.uid;
    if (!isMyTurn || !gameState) return;
    if (!playable.includes(idx)) return;

    const tile = { ...myHand[idx] };
    const board = gameState.board || [];
    let position = 'right';
    let finalTile = { ...tile };

    if (board.length === 0) {
      position = 'right';
    } else {
      const leftEnd = board[0].v1;
      const rightEnd = board[board.length - 1].v2;

      if (tile.v1 === rightEnd) {
        position = 'right';
      } else if (tile.v2 === rightEnd) {
        position = 'right';
        finalTile = { ...tile, v1: tile.v2, v2: tile.v1 };
      } else if (tile.v2 === leftEnd) {
        position = 'left';
      } else if (tile.v1 === leftEnd) {
        position = 'left';
        finalTile = { ...tile, v1: tile.v2, v2: tile.v1 };
      }
    }

    const newHand = myHand.filter((_, i) => i !== idx);
    const newBoard = position === 'left' ? [finalTile, ...board] : [...board, finalTile];
    const opponentUid = currentUser.uid === gameData.player1Uid ? gameData.player2Uid : gameData.player1Uid;

    const updates = {
      board: newBoard,
      [`hands/${currentUser.uid}`]: newHand,
      turn: opponentUid,
      consecutivePasses: 0,
      lastAction: { by: currentUser.uid, type: 'played', tile: finalTile },
    };

    await update(gameRef, updates);

    // Victoire : main vide
    if (newHand.length === 0) {
      await finishGame(currentUser.uid, 'tombe');
    }
  };

  // ─── PIOCHER / PASSER ───────────────────────────────────────────────────
  const handleDraw = async () => {
    const isMyTurn = gameState?.turn === currentUser.uid;
    if (!isMyTurn || !gameState) return;

    const opponentUid = currentUser.uid === gameData.player1Uid ? gameData.player2Uid : gameData.player1Uid;
    const deck = gameState.deck || [];

    if (deck.length > 0) {
      const newDeck = [...deck];
      const drawnTile = newDeck.pop();
      const newHand = [...myHand, drawnTile];

      await update(gameRef, {
        deck: newDeck,
        [`hands/${currentUser.uid}`]: newHand,
        turn: opponentUid,
        consecutivePasses: 0,
        lastAction: { by: currentUser.uid, type: 'drew', tile: drawnTile },
      });
    } else {
      // Pioche vide → passer
      const newPassCount = (gameState.consecutivePasses || 0) + 1;

      await update(gameRef, {
        consecutivePasses: newPassCount,
        turn: opponentUid,
        lastAction: { by: currentUser.uid, type: 'passed' },
      });

      // 2 passes consécutives = blocage, le moins de points gagne
      if (newPassCount >= 2) {
        const opHand = gameState.hands?.[opponentUid] || [];
        const myScore = sumHand(myHand);
        const opScore = sumHand(opHand);
        const winnerUid = myScore <= opScore ? currentUser.uid : opponentUid;
        await finishGame(winnerUid, 'blokaj');
      }
    }
  };

  // ─── MAJ JETONS & EXIT ──────────────────────────────────────────────────
  const handleExit = async () => {
    if (!result) { onExit(); return; }
    const bet = parseInt(gameData.bet);
    try {
      const userRef = ref(database, `users/${currentUser.uid}/tokens`);
      const snap = await get(userRef);
      const current = snap.val() || 0;
      await set(userRef, result.won ? current + bet : Math.max(0, current - bet));
    } catch (e) {
      console.error('Erreur jetons:', e);
    }
    // Cleanup
    try { await remove(gameRef); } catch (_) {}
    onExit();
  };

  // ─── RENDER UTILS ────────────────────────────────────────────────────────
  if (loading || !gameState) {
    return (
      <div className="fixed inset-0 bg-emerald-950 flex flex-col items-center justify-center z-[150]">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-emerald-700 border-t-emerald-300 animate-spin" />
        </div>
        <p className="text-emerald-300 mt-4 font-semibold tracking-wider text-sm">Chajman jwèt...</p>
      </div>
    );
  }

  const opponentUid = currentUser.uid === gameData.player1Uid ? gameData.player2Uid : gameData.player1Uid;
  const opponentPseudo = currentUser.uid === gameData.player1Uid ? gameData.player2Pseudo : gameData.player1Pseudo;
  const myPseudo = currentUser.uid === gameData.player1Uid ? gameData.player1Pseudo : gameData.player2Pseudo;
  const isMyTurn = gameState.turn === currentUser.uid;
  const opponentHandCount = gameState.hands?.[opponentUid]?.length ?? 7;
  const deckCount = gameState.deck?.length || 0;
  const board = gameState.board || [];
  const hasPlayable = playable.length > 0;
  const lastAction = gameState.lastAction;

  return (
    <div className="fixed inset-0 z-[150] flex flex-col overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at top, #064e3b 0%, #022c22 60%, #011a15 100%)' }}>

      {/* ── FOND DÉCORATIF ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #34d399, transparent)' }} />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #059669, transparent)' }} />
      </div>

      {/* ══ HEADER ADVERSAIRE ══ */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(52,211,153,0.15)' }}>

        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <User className="w-5 h-5 text-white" />
            </div>
            {gameState.turn === opponentUid && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-yellow-400 border-2 border-emerald-950 animate-pulse" />
            )}
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">{opponentPseudo}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <div className="flex gap-0.5">
                {Array.from({ length: Math.min(opponentHandCount, 7) }, (_, i) => (
                  <div key={i} className="w-3 h-5 rounded-sm bg-emerald-700 border border-emerald-600 shadow-sm" />
                ))}
              </div>
              <span className="text-emerald-400 text-xs ml-1">{opponentHandCount}</span>
            </div>
          </div>
        </div>

        {/* Mise */}
        <div className="flex items-center gap-1.5 bg-yellow-500/20 border border-yellow-500/40 rounded-xl px-3 py-1.5">
          <Coins className="w-4 h-4 text-yellow-400" />
          <span className="text-yellow-300 font-bold text-sm">{gameData.bet}</span>
        </div>

        {/* Statut tour */}
        <div className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all ${
          gameState.turn === opponentUid
            ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30'
            : 'bg-white/10 text-white/50'
        }`}>
          {gameState.turn === opponentUid ? '⚡ TOU LI' : 'TANN...'}
        </div>
      </div>

      {/* ══ ZONE DE JEU : PLATEAU ══ */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">

        {/* Last action notification */}
        {lastAction && lastAction.by === opponentUid && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20
            bg-black/60 backdrop-blur-sm text-white text-xs px-4 py-1.5 rounded-full border border-white/10 shadow-lg">
            {lastAction.type === 'played' && `${opponentPseudo} jwe [${lastAction.tile?.v1}|${lastAction.tile?.v2}]`}
            {lastAction.type === 'drew' && `${opponentPseudo} pran yon domino`}
            {lastAction.type === 'passed' && `${opponentPseudo} pase (pioche vid)`}
          </div>
        )}

        {/* PLATEAU */}
        <div className="w-full max-w-full overflow-x-auto overflow-y-hidden">
          <div className="relative flex items-center justify-center min-h-[120px] px-2">
            {/* Tapis de jeu */}
            <div className="absolute inset-2 rounded-2xl opacity-30"
              style={{ background: 'repeating-linear-gradient(45deg, #065f46 0px, #065f46 1px, transparent 1px, transparent 12px)' }} />

            {board.length === 0 ? (
              <div className="flex flex-col items-center gap-2 opacity-40">
                <div className="w-12 h-24 rounded-xl border-2 border-dashed border-emerald-400" />
                <p className="text-emerald-400 text-xs font-semibold tracking-wider uppercase">Jwe premye domino</p>
              </div>
            ) : (
              <div className="flex gap-1 items-center py-2 px-2"
                style={{ minWidth: 'max-content' }}>
                {board.map((tile, i) => (
                  <DominoTile key={i} tile={tile} disabled mini />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Infos plateau */}
        <div className="flex gap-4 mt-2">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-black/30 rounded-full px-3 py-1">
            <span className="font-bold">{deckCount}</span>
            <span className="opacity-70">nan pioche</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-black/30 rounded-full px-3 py-1">
            <span className="font-bold">{board.length}</span>
            <span className="opacity-70">sou plato</span>
          </div>
          {(gameState.consecutivePasses || 0) > 0 && (
            <div className="flex items-center gap-1 text-xs text-orange-400 bg-orange-500/10 rounded-full px-3 py-1 border border-orange-500/30">
              ⚠️ <span>{gameState.consecutivePasses} pas</span>
            </div>
          )}
        </div>
      </div>

      {/* ══ MAIN DU JOUEUR ══ */}
      <div className="relative z-10"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(52,211,153,0.15)' }}>

        {/* En-tête ma main */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow">
                <User className="w-4 h-4 text-white" />
              </div>
              {isMyTurn && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-yellow-400 border-2 border-black animate-pulse" />
              )}
            </div>
            <span className="text-white font-bold text-sm">{myPseudo}</span>
            <span className="text-emerald-400 text-xs">({myHand.length} kart)</span>
          </div>

          <div className={`text-xs font-black px-4 py-1.5 rounded-full transition-all duration-300 ${
            isMyTurn
              ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/40 scale-105'
              : 'bg-white/10 text-white/40'
          }`}>
            {isMyTurn ? '⚡ TOU OU' : 'TANN...'}
          </div>
        </div>

        {/* Tuiles */}
        <div className="flex gap-2 overflow-x-auto px-4 py-3 items-end justify-center"
          style={{ scrollbarWidth: 'none' }}>
          {myHand.length === 0 ? (
            <p className="text-emerald-400 text-sm italic py-6">Men ou vid...</p>
          ) : (
            myHand.map((tile, i) => (
              <DominoTile
                key={tile.id || i}
                tile={tile}
                onClick={() => handlePlayTile(i)}
                disabled={!isMyTurn}
                highlight={isMyTurn && playable.includes(i)}
              />
            ))
          )}
        </div>

        {/* Boutons action */}
        <div className="flex gap-3 px-4 pb-4 pt-1">
          <button
            onClick={handleDraw}
            disabled={!isMyTurn || hasPlayable}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
              isMyTurn && !hasPlayable
                ? 'bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/30 active:scale-95'
                : 'bg-white/5 text-white/20 cursor-not-allowed'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            {deckCount > 0 ? 'Pran Domino' : 'Pase Tou'}
          </button>

          <button
            onClick={handleExit}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-red-600/80 hover:bg-red-500 text-white font-bold text-sm transition-all active:scale-95 shadow"
          >
            <ArrowLeft className="w-4 h-4" />
            Kite
          </button>
        </div>
      </div>

      {/* ══ MODAL RÉSULTAT ══ */}
      {result && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
          <div className={`w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl
            transform transition-all duration-500 scale-100
            ${result.won ? 'border-2 border-yellow-400/60' : 'border-2 border-gray-600/40'}`}
            style={{ background: result.won
              ? 'linear-gradient(145deg, #1a1a2e, #16213e)'
              : 'linear-gradient(145deg, #1a1a1a, #2d2d2d)' }}>

            {/* Bande supérieure */}
            <div className={`h-2 w-full ${result.won ? 'bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500' : 'bg-gradient-to-r from-gray-600 to-gray-700'}`} />

            <div className="p-8 text-center">
              {/* Icône animée */}
              <div className="flex justify-center mb-5">
                {result.won ? (
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-yellow-400/10 border-2 border-yellow-400/30 flex items-center justify-center">
                      <Trophy className="w-12 h-12 text-yellow-400" />
                    </div>
                    {/* Étoiles */}
                    {['top-0 right-0', 'top-2 left-0', 'bottom-0 right-2'].map((pos, i) => (
                      <div key={i} className={`absolute ${pos} text-yellow-300 text-lg animate-bounce`}
                        style={{ animationDelay: `${i * 0.15}s` }}>✦</div>
                    ))}
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gray-700/50 border-2 border-gray-600/40 flex items-center justify-center">
                    <Skull className="w-12 h-12 text-gray-400" />
                  </div>
                )}
              </div>

              {/* Titre */}
              <h2 className={`text-3xl font-black mb-1 tracking-tight ${result.won ? 'text-yellow-300' : 'text-gray-300'}`}>
                {result.won
                  ? (result.type === 'djapot' ? 'DJAPOT!!' : result.type === 'blokaj' ? 'Ou Genyen!' : 'OU TONBE!')
                  : 'Ou Pedi...'}
              </h2>
              <p className="text-sm mb-6 opacity-60 text-white">
                {result.type === 'tombe' && result.won && 'Men ou te vid — viktorya!'}
                {result.type === 'tombe' && !result.won && `${opponentPseudo} te fini anvan ou`}
                {result.type === 'blokaj' && 'Pati bloke — mwens pwen genyen'}
                {result.type === 'djapot' && 'Jackpot — gwo chans!'}
              </p>

              {/* Montant */}
              <div className={`rounded-2xl p-5 mb-6 ${
                result.won
                  ? 'bg-gradient-to-r from-yellow-500/20 to-amber-500/10 border border-yellow-500/30'
                  : 'bg-red-900/20 border border-red-800/30'
              }`}>
                <div className={`text-4xl font-black ${result.won ? 'text-yellow-300' : 'text-red-400'}`}>
                  {result.won ? '+' : '-'}{result.amount}
                </div>
                <div className="flex items-center justify-center gap-1 mt-1 opacity-60">
                  <Coins className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-white">Jeton</span>
                </div>
              </div>

              {/* Bouton */}
              <button
                onClick={handleExit}
                className={`w-full py-4 rounded-2xl font-black text-base transition-all active:scale-95 ${
                  result.won
                    ? 'bg-gradient-to-r from-yellow-400 to-amber-400 text-black hover:from-yellow-300 hover:to-amber-300 shadow-lg shadow-yellow-500/30'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                Retounen Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiplayerGame;