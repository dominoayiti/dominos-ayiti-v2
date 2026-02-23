import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, Coins, ArrowLeft, RotateCcw, Skull, Trophy, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { database } from '../firebase-config';
import { ref, set, onValue, update, get, remove, onDisconnect, serverTimestamp } from 'firebase/database';

// ─── CONSTANTES ──────────────────────────────────────────────────────────────
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

const sumHand = (hand) => (hand || []).reduce((s, t) => s + t.v1 + t.v2, 0);

// ─── DOTS DOMINO ─────────────────────────────────────────────────────────────
const DotGrid = ({ value }) => {
  const patterns = {
    0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8],
    4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
  };
  return (
    <div className="grid grid-cols-3 gap-[1px] w-full h-full p-[2px]">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="flex items-center justify-center">
          {(patterns[value] || []).includes(i) && (
            <div className="w-[5px] h-[5px] rounded-full bg-gray-800" />
          )}
        </div>
      ))}
    </div>
  );
};

const DominoTile = ({ tile, onClick, disabled, highlight, mini }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`
      ${mini ? 'w-8 h-16' : 'w-12 h-24'}
      relative flex flex-col rounded-lg border-2 shadow-md
      transition-all duration-150 select-none overflow-hidden
      ${disabled
        ? 'border-gray-300 bg-gray-50 cursor-default opacity-70'
        : highlight
        ? 'border-yellow-400 bg-white cursor-pointer hover:scale-110 hover:-translate-y-1 shadow-yellow-200/60 shadow-lg'
        : 'border-gray-300 bg-white cursor-pointer hover:scale-105 hover:-translate-y-0.5'
      }
    `}
  >
    <div className={`flex-1 flex items-center justify-center ${mini ? 'w-[14px] h-[14px]' : 'w-[26px] h-[26px]'}`}>
      <DotGrid value={tile.v1} />
    </div>
    <div className="h-px bg-gray-400 mx-1 shrink-0" />
    <div className={`flex-1 flex items-center justify-center ${mini ? 'w-[14px] h-[14px]' : 'w-[26px] h-[26px]'}`}>
      <DotGrid value={tile.v2} />
    </div>
    {highlight && !disabled && (
      <div className="absolute inset-0 rounded-lg ring-2 ring-yellow-400 ring-opacity-70 pointer-events-none" />
    )}
  </button>
);

// ─── TOAST HELPER ─────────────────────────────────────────────────────────────
const showToast = (msg, color = 'bg-gray-800', duration = 3000) => {
  const el = document.createElement('div');
  el.className = `fixed top-6 left-1/2 -translate-x-1/2 ${color} text-white px-5 py-3 rounded-2xl shadow-2xl z-[9999] text-sm font-semibold flex items-center gap-2 transition-all`;
  el.innerHTML = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
};

// ─── COMPOSANT PRINCIPAL ──────────────────────────────────────────────────────
const MultiplayerGame = ({ gameData, currentUser, onExit }) => {
  const [loading, setLoading]           = useState(true);
  const [gameState, setGameState]       = useState(null);
  const [myHand, setMyHand]             = useState([]);
  const [result, setResult]             = useState(null);
  const [playable, setPlayable]         = useState([]);

  // Présence & réseau
  const [opponentOnline, setOpponentOnline]   = useState(true);
  const [opponentDiscoAt, setOpponentDiscoAt] = useState(null);
  const [ setMyConnected]         = useState(true);
  const [showNetworkAlert, setShowNetworkAlert] = useState(false);

  // Abandon
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  const resultHandled = useRef(false);
  const presenceCleanup = useRef(null);

  const gameRef     = ref(database, `games/${gameData.sessionId}`);
  const opponentUid = currentUser.uid === gameData.player1Uid ? gameData.player2Uid : gameData.player1Uid;
  const opponentPseudo = currentUser.uid === gameData.player1Uid ? gameData.player2Pseudo : gameData.player1Pseudo;
  const myPseudo    = currentUser.uid === gameData.player1Uid ? gameData.player1Pseudo : gameData.player2Pseudo;

  // ─── INIT JEU ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const initGame = async () => {
      if (currentUser.uid !== gameData.player1Uid) return;
      const snap = await get(gameRef);
      if (snap.exists()) return;
      const deck   = shuffleDeck(generateDeck());
      const p1Hand = deck.slice(0, 7);
      const p2Hand = deck.slice(7, 14);
      await set(gameRef, {
        status: 'playing',
        board: [],
        deck: deck.slice(14),
        turn: gameData.player1Uid,
        lastAction: null,
        consecutivePasses: 0,
        winner: null,
        winType: null,
        startedAt: Date.now(),
        paused: false,
        hands: {
          [gameData.player1Uid]: p1Hand,
          [gameData.player2Uid]: p2Hand,
        },
      });
    };
    initGame();
  }, []); // eslint-disable-line

  // ─── PRÉSENCE FIREBASE (.info/connected + onDisconnect) ───────────────────
  useEffect(() => {
    const connectedRef     = ref(database, '.info/connected');
    const myPresenceRef    = ref(database, `gamePresence/${gameData.sessionId}/${currentUser.uid}`);
    const oppPresenceRef   = ref(database, `gamePresence/${gameData.sessionId}/${opponentUid}`);

    // Ma propre connexion
    const unsubConnected = onValue(connectedRef, async (snap) => {
      const connected = snap.val();
      setMyConnected(connected);

      if (connected) {
        setShowNetworkAlert(false);
        // Écrire présence + programmer suppression si déconnexion
        await set(myPresenceRef, { online: true, lastSeen: Date.now() });
        onDisconnect(myPresenceRef).set({ online: false, lastSeen: serverTimestamp() });
      } else {
        setShowNetworkAlert(true);
        showToast('⚠️ Koneksyon ou fèb — ap eseye rekonekte...', 'bg-orange-600', 6000);
      }
    });

    // Présence adversaire
    const unsubOpp = onValue(oppPresenceRef, (snap) => {
      const data = snap.val();
      if (!data) return;

      const wasOnline = opponentOnline;
      const isOnline  = data.online === true;
      setOpponentOnline(isOnline);

      if (!isOnline && wasOnline) {
        // Vient de se déconnecter
        const discoTime = Date.now();
        setOpponentDiscoAt(discoTime);
        showToast(`📡 ${opponentPseudo} pèdi koneksyon...`, 'bg-orange-700', 5000);

        // Après 30 secondes sans reconnexion → victoire par forfait
        const timer = setTimeout(async () => {
          const freshSnap = await get(oppPresenceRef);
          const fresh = freshSnap.val();
          if (!fresh || fresh.online === false) {
            showToast(`⏱️ ${opponentPseudo} dekonekte twòp lontan — ou genyen!`, 'bg-green-600', 5000);
            await finishGame(currentUser.uid, 'forfait');
          }
        }, 30000);
        presenceCleanup.current = timer;
      }

      if (isOnline && !wasOnline) {
        setOpponentDiscoAt(null);
        clearTimeout(presenceCleanup.current);
        showToast(`✅ ${opponentPseudo} rekonekte!`, 'bg-green-700', 3000);
      }
    });

    return () => {
      unsubConnected();
      unsubOpp();
      clearTimeout(presenceCleanup.current);
      // Nettoyer ma présence
      set(myPresenceRef, { online: false, lastSeen: Date.now() }).catch(() => {});
    };
  }, []); // eslint-disable-line

  // ─── ÉCOUTE ÉTAT DU JEU ───────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onValue(gameRef, (snap) => {
      const data = snap.val();
      if (!data) { setLoading(false); return; }

      setLoading(false);
      setGameState(data);

      if (data.hands?.[currentUser.uid]) setMyHand(data.hands[currentUser.uid]);

      if (data.status === 'finished' && data.winner && !resultHandled.current) {
        resultHandled.current = true;
        const iWon = data.winner === currentUser.uid;
        setResult({ won: iWon, type: data.winType, amount: parseInt(gameData.bet) });
      }
    });
    return () => unsub();
  }, []); // eslint-disable-line

  // ─── TUILES JOUABLES ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameState || !myHand.length) { setPlayable([]); return; }
    const board = gameState.board || [];
    if (board.length === 0) { setPlayable(myHand.map((_, i) => i)); return; }
    const leftEnd  = board[0].v1;
    const rightEnd = board[board.length - 1].v2;
    setPlayable(
      myHand
        .map((t, i) => (t.v1 === leftEnd || t.v2 === leftEnd || t.v1 === rightEnd || t.v2 === rightEnd ? i : -1))
        .filter(i => i !== -1)
    );
  }, [myHand, gameState]);

  // ─── FIN DE PARTIE (écrit dans Firebase) ──────────────────────────────────
  const finishGame = useCallback(async (winnerUid, winType) => {
    try {
      await update(gameRef, {
        status: 'finished',
        winner: winnerUid,
        winType,
        finishedAt: Date.now(),
      });
    } catch (e) {
      console.error('finishGame error:', e);
    }
  }, [gameRef]);

  // ─── JOUER UNE TUILE ──────────────────────────────────────────────────────
  const handlePlayTile = async (idx) => {
    if (gameState?.turn !== currentUser.uid || !gameState) return;
    if (!playable.includes(idx)) return;

    const tile  = { ...myHand[idx] };
    const board = gameState.board || [];
    let position  = 'right';
    let finalTile = { ...tile };

    if (board.length > 0) {
      const leftEnd  = board[0].v1;
      const rightEnd = board[board.length - 1].v2;

      if (tile.v1 === rightEnd)       { position = 'right'; }
      else if (tile.v2 === rightEnd)  { position = 'right'; finalTile = { ...tile, v1: tile.v2, v2: tile.v1 }; }
      else if (tile.v2 === leftEnd)   { position = 'left'; }
      else if (tile.v1 === leftEnd)   { position = 'left';  finalTile = { ...tile, v1: tile.v2, v2: tile.v1 }; }
    }

    const newHand  = myHand.filter((_, i) => i !== idx);
    const newBoard = position === 'left' ? [finalTile, ...board] : [...board, finalTile];

    await update(gameRef, {
      board: newBoard,
      [`hands/${currentUser.uid}`]: newHand,
      turn: opponentUid,
      consecutivePasses: 0,
      lastAction: { by: currentUser.uid, type: 'played', tile: finalTile },
    });

    if (newHand.length === 0) await finishGame(currentUser.uid, 'tombe');
  };

  // ─── PIOCHER / PASSER ─────────────────────────────────────────────────────
  const handleDraw = async () => {
    if (gameState?.turn !== currentUser.uid || !gameState) return;
    const deck = gameState.deck || [];

    if (deck.length > 0) {
      const newDeck   = [...deck];
      const drawn     = newDeck.pop();
      const newHand   = [...myHand, drawn];
      await update(gameRef, {
        deck: newDeck,
        [`hands/${currentUser.uid}`]: newHand,
        turn: opponentUid,
        consecutivePasses: 0,
        lastAction: { by: currentUser.uid, type: 'drew', tile: drawn },
      });
    } else {
      const newPasses = (gameState.consecutivePasses || 0) + 1;
      await update(gameRef, {
        consecutivePasses: newPasses,
        turn: opponentUid,
        lastAction: { by: currentUser.uid, type: 'passed' },
      });
      if (newPasses >= 2) {
        const opHand   = gameState.hands?.[opponentUid] || [];
        const myScore  = sumHand(myHand);
        const opScore  = sumHand(opHand);
        await finishGame(myScore <= opScore ? currentUser.uid : opponentUid, 'blokaj');
      }
    }
  };

  // ─── ABANDON (avec pénalité) ──────────────────────────────────────────────
  const handleAbandonConfirm = async () => {
    setShowAbandonConfirm(false);
    // Adversaire gagne par forfait
    await finishGame(opponentUid, 'abandon');
    // Attendre que result soit mis à jour via listener avant d'exit
  };

  // ─── MAJ JETONS & EXIT ────────────────────────────────────────────────────
  const handleExit = useCallback(async () => {
    if (!result) { onExit(); return; }
    const bet = parseInt(gameData.bet);
    try {
      const myTokenRef  = ref(database, `users/${currentUser.uid}/tokens`);
      const oppTokenRef = ref(database, `users/${opponentUid}/tokens`);

      const [mySnap, oppSnap] = await Promise.all([get(myTokenRef), get(oppTokenRef)]);
      const myTokens  = mySnap.val()  || 0;
      const oppTokens = oppSnap.val() || 0;

      if (result.won) {
        // Gagnant récupère sa mise + la mise de l'adversaire
        await set(myTokenRef,  myTokens  + bet);
        await set(oppTokenRef, Math.max(0, oppTokens - bet));
      } else {
        // Perdant perd sa mise, gagnant (adversaire) a déjà été mis à jour
        await set(myTokenRef, Math.max(0, myTokens - bet));
        await set(oppTokenRef, oppTokens + bet);
      }
    } catch (e) {
      console.error('Erreur tokens:', e);
    }
    try { await remove(gameRef); } catch (_) {}
    try { await remove(ref(database, `gamePresence/${gameData.sessionId}`)); } catch (_) {}
    onExit();
  }, [result, gameData, currentUser.uid, opponentUid, gameRef, onExit]);

  // ─── EXIT AUTO quand result arrivé via listener (cas abandon) ─────────────
  // (on ne force pas l'exit — on affiche le modal de résultat normalement)

  // ─── RENDER ───────────────────────────────────────────────────────────────
  if (loading || !gameState) {
    return (
      <div className="fixed inset-0 bg-emerald-950 flex flex-col items-center justify-center z-[150]">
        <div className="w-16 h-16 rounded-full border-4 border-emerald-700 border-t-emerald-300 animate-spin" />
        <p className="text-emerald-300 mt-4 font-semibold tracking-wider text-sm">Chajman jwèt...</p>
      </div>
    );
  }

  const isMyTurn        = gameState.turn === currentUser.uid;
  const opponentHandCount = gameState.hands?.[opponentUid]?.length ?? 7;
  const deckCount       = gameState.deck?.length || 0;
  const board           = gameState.board || [];
  const hasPlayable     = playable.length > 0;
  const lastAction      = gameState.lastAction;

  // Secondes depuis déco adversaire
  const discoSeconds = opponentDiscoAt ? Math.floor((Date.now() - opponentDiscoAt) / 1000) : 0;

  return (
    <div className="fixed inset-0 z-[150] flex flex-col overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at top, #064e3b 0%, #022c22 60%, #011a15 100%)' }}>

      {/* Fond décoratif */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #34d399, transparent)' }} />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #059669, transparent)' }} />
      </div>

      {/* ── BANNIÈRE RÉSEAU FAIBLE ── */}
      {showNetworkAlert && (
        <div className="relative z-20 bg-orange-600 text-white text-center text-xs py-2 px-4 flex items-center justify-center gap-2 animate-pulse">
          <WifiOff className="w-4 h-4" />
          <span>Koneksyon ou fèb — ap eseye rekonekte...</span>
        </div>
      )}

      {/* ── BANNIÈRE ADVERSAIRE DÉCONNECTÉ ── */}
      {!opponentOnline && (
        <div className="relative z-20 bg-yellow-600 text-black text-center text-xs py-2 px-4 flex items-center justify-center gap-2">
          <Wifi className="w-4 h-4" />
          <span>{opponentPseudo} dekonekte — ap tann li ({Math.max(0, 30 - discoSeconds)}s avan forfè)</span>
        </div>
      )}

      {/* ══ HEADER ADVERSAIRE ══ */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(52,211,153,0.15)' }}>

        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg
              ${opponentOnline ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gray-600'}`}>
              <User className="w-5 h-5 text-white" />
            </div>
            {/* Indicateur online/offline */}
            <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-emerald-950
              ${opponentOnline ? 'bg-green-400' : 'bg-red-500 animate-pulse'}`} />
            {gameState.turn === opponentUid && opponentOnline && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-yellow-400 animate-ping" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-white font-bold text-sm leading-none">{opponentPseudo}</p>
              {opponentOnline
                ? <span className="text-[9px] text-green-400 font-semibold">● EN LIGN</span>
                : <span className="text-[9px] text-red-400 font-semibold">● DEKONEKTE</span>
              }
            </div>
            <div className="flex gap-0.5 mt-0.5">
              {Array.from({ length: Math.min(opponentHandCount, 7) }, (_, i) => (
                <div key={i} className="w-3 h-5 rounded-sm bg-emerald-700 border border-emerald-600 shadow-sm" />
              ))}
              <span className="text-emerald-400 text-xs ml-1">{opponentHandCount}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-yellow-500/20 border border-yellow-500/40 rounded-xl px-3 py-1.5">
          <Coins className="w-4 h-4 text-yellow-400" />
          <span className="text-yellow-300 font-bold text-sm">{gameData.bet}</span>
        </div>

        <div className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all ${
          gameState.turn === opponentUid
            ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30'
            : 'bg-white/10 text-white/50'
        }`}>
          {gameState.turn === opponentUid ? '⚡ TOU LI' : 'TANN...'}
        </div>
      </div>

      {/* ══ PLATEAU ══ */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">

        {lastAction && lastAction.by === opponentUid && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20
            bg-black/60 backdrop-blur-sm text-white text-xs px-4 py-1.5 rounded-full border border-white/10 shadow-lg">
            {lastAction.type === 'played' && `${opponentPseudo} jwe [${lastAction.tile?.v1}|${lastAction.tile?.v2}]`}
            {lastAction.type === 'drew'   && `${opponentPseudo} pran yon domino`}
            {lastAction.type === 'passed' && `${opponentPseudo} pase (pioche vid)`}
          </div>
        )}

        <div className="w-full max-w-full overflow-x-auto overflow-y-hidden">
          <div className="relative flex items-center justify-center min-h-[120px] px-2">
            <div className="absolute inset-2 rounded-2xl opacity-30"
              style={{ background: 'repeating-linear-gradient(45deg,#065f46 0px,#065f46 1px,transparent 1px,transparent 12px)' }} />
            {board.length === 0 ? (
              <div className="flex flex-col items-center gap-2 opacity-40">
                <div className="w-12 h-24 rounded-xl border-2 border-dashed border-emerald-400" />
                <p className="text-emerald-400 text-xs font-semibold tracking-wider uppercase">Jwe premye domino</p>
              </div>
            ) : (
              <div className="flex gap-1 items-center py-2 px-2" style={{ minWidth: 'max-content' }}>
                {board.map((tile, i) => (
                  <DominoTile key={i} tile={tile} disabled mini />
                ))}
              </div>
            )}
          </div>
        </div>

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
            <div className="text-xs text-orange-400 bg-orange-500/10 rounded-full px-3 py-1 border border-orange-500/30">
              ⚠️ {gameState.consecutivePasses} pas
            </div>
          )}
        </div>
      </div>

      {/* ══ MAIN DU JOUEUR ══ */}
      <div className="relative z-10"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(52,211,153,0.15)' }}>

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
            isMyTurn ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/40 scale-105' : 'bg-white/10 text-white/40'
          }`}>
            {isMyTurn ? '⚡ TOU OU' : 'TANN...'}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 py-3 items-end justify-center" style={{ scrollbarWidth: 'none' }}>
          {myHand.length === 0
            ? <p className="text-emerald-400 text-sm italic py-6">Men ou vid...</p>
            : myHand.map((tile, i) => (
                <DominoTile
                  key={tile.id || i}
                  tile={tile}
                  onClick={() => handlePlayTile(i)}
                  disabled={!isMyTurn}
                  highlight={isMyTurn && playable.includes(i)}
                />
              ))
          }
        </div>

        <div className="flex gap-3 px-4 pb-4 pt-1">
          <button
            onClick={handleDraw}
            disabled={!isMyTurn || hasPlayable}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
              isMyTurn && !hasPlayable
                ? 'bg-orange-500 hover:bg-orange-400 text-white shadow-lg active:scale-95'
                : 'bg-white/5 text-white/20 cursor-not-allowed'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            {deckCount > 0 ? 'Pran Domino' : 'Pase Tou'}
          </button>

          <button
            onClick={() => setShowAbandonConfirm(true)}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-red-600/80 hover:bg-red-500 text-white font-bold text-sm transition-all active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            Kite
          </button>
        </div>
      </div>

      {/* ══ POPUP ABANDON ══ */}
      {showAbandonConfirm && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}>
          <div className="bg-gray-900 border border-red-500/40 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-black text-lg">Abandon?</h3>
                <p className="text-gray-400 text-xs">Konsekans pati</p>
              </div>
            </div>

            <div className="bg-red-900/30 border border-red-700/40 rounded-xl p-4 mb-5">
              <p className="text-red-300 text-sm font-semibold mb-2">⚠️ Si ou kite jeu a kounye a :</p>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>• {opponentPseudo} ap <span className="text-green-400 font-bold">genyen pa forfè</span></li>
                <li>• Ou ap <span className="text-red-400 font-bold">pèdi {gameData.bet} jeton</span></li>
                <li>• Rezilta a pap chanje</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowAbandonConfirm(false)}
                className="flex-1 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold text-sm transition-colors"
              >
                Kontinye Jwe
              </button>
              <button
                onClick={handleAbandonConfirm}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-colors"
              >
                Abandone (-{gameData.bet})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL RÉSULTAT ══ */}
      {result && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
          <div className={`w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl
            ${result.won ? 'border-2 border-yellow-400/60' : 'border-2 border-gray-600/40'}`}
            style={{ background: result.won ? 'linear-gradient(145deg,#1a1a2e,#16213e)' : 'linear-gradient(145deg,#1a1a1a,#2d2d2d)' }}>

            <div className={`h-2 w-full ${result.won ? 'bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500' : 'bg-gradient-to-r from-gray-600 to-gray-700'}`} />

            <div className="p-8 text-center">
              <div className="flex justify-center mb-5">
                {result.won ? (
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-yellow-400/10 border-2 border-yellow-400/30 flex items-center justify-center">
                      <Trophy className="w-12 h-12 text-yellow-400" />
                    </div>
                    {['top-0 right-0','top-2 left-0','bottom-0 right-2'].map((pos, i) => (
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

              <h2 className={`text-3xl font-black mb-1 tracking-tight ${result.won ? 'text-yellow-300' : 'text-gray-300'}`}>
                {result.won
                  ? (result.type === 'blokaj' ? 'Ou Genyen!' : result.type === 'forfait' || result.type === 'abandon' ? 'Forfè!' : 'OU TONBE!')
                  : (result.type === 'abandon' ? 'Ou Abandone...' : 'Ou Pedi...')}
              </h2>

              <p className="text-sm mb-6 opacity-60 text-white">
                {result.type === 'tombe'   && result.won  && 'Men ou te vid — viktorya!'}
                {result.type === 'tombe'   && !result.won && `${opponentPseudo} fini anvan ou`}
                {result.type === 'blokaj'  && 'Pati bloke — mwens pwen genyen'}
                {result.type === 'forfait' && result.won  && `${opponentPseudo} dekonekte twòp lontan`}
                {result.type === 'abandon' && result.won  && `${opponentPseudo} abandone pati a`}
                {result.type === 'abandon' && !result.won && 'Ou kite pati a — pénalité aplike'}
              </p>

              {/* Calcul jetons */}
              <div className={`rounded-2xl p-5 mb-4 ${result.won
                ? 'bg-gradient-to-r from-yellow-500/20 to-amber-500/10 border border-yellow-500/30'
                : 'bg-red-900/20 border border-red-800/30'}`}>
                <div className={`text-4xl font-black ${result.won ? 'text-yellow-300' : 'text-red-400'}`}>
                  {result.won ? `+${result.amount}` : `-${result.amount}`}
                </div>
                <div className="flex items-center justify-center gap-1 mt-1 opacity-60">
                  <Coins className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-white">Jeton</span>
                </div>
                {result.won && (
                  <p className="text-xs text-yellow-400/70 mt-2">
                    Mise ou ({result.amount}) + mise advèsè ({result.amount}) = +{result.amount} nèt
                  </p>
                )}
              </div>

              <button
                onClick={handleExit}
                className={`w-full py-4 rounded-2xl font-black text-base transition-all active:scale-95 ${
                  result.won
                    ? 'bg-gradient-to-r from-yellow-400 to-amber-400 text-black hover:from-yellow-300 shadow-lg shadow-yellow-500/30'
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