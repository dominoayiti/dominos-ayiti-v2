import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, Coins, ArrowLeft, RotateCcw, Skull, Trophy, Wifi, WifiOff, AlertTriangle, ArrowLeftCircle, ArrowRightCircle } from 'lucide-react';
import { database } from '../firebase-config';
import { ref, set, onValue, update, get, remove, onDisconnect, serverTimestamp } from 'firebase/database';

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const generateDeck = () => {
  const deck = [];
  for (let i = 0; i <= 6; i++)
    for (let j = i; j <= 6; j++)
      deck.push({ v1: i, v2: j, id: `${i}-${j}-${Math.random()}` });
  return deck;
};

const shuffleDeck = (deck) => {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
};

const sumHand = (hand) => (hand || []).reduce((s, t) => s + t.v1 + t.v2, 0);

// ─── DOT PATTERNS ─────────────────────────────────────────────────────────────
const DOT_PATTERNS = {
  0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8],
  4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

const DotGrid = ({ value, dotPx = 7 }) => {
  const dots = DOT_PATTERNS[value] || [];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 2,
      width: '100%', height: '100%', padding: 4, boxSizing: 'border-box',
    }}>
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {dots.includes(i) && (
            <div style={{
              width: dotPx, height: dotPx, borderRadius: '50%',
              backgroundColor: '#111827', flexShrink: 0,
              boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
            }} />
          )}
        </div>
      ))}
    </div>
  );
};

// ─── TUILE MAIN ───────────────────────────────────────────────────────────────
const HandDomino = ({ tile, onClick, disabled, highlight }) => (
  <button
    onClick={onClick} disabled={disabled}
    style={{
      flexShrink: 0, width: 44, height: 88,
      display: 'flex', flexDirection: 'column',
      borderRadius: 12,
      border: `2px solid ${highlight && !disabled ? '#facc15' : '#d1d5db'}`,
      background: 'white', cursor: disabled ? 'default' : 'pointer', outline: 'none',
      boxShadow: highlight && !disabled
        ? '0 0 16px rgba(250,204,21,0.5), 0 4px 12px rgba(0,0,0,0.3)'
        : '0 2px 8px rgba(0,0,0,0.2)',
      opacity: disabled ? 0.6 : 1,
      transition: 'transform 0.1s',
      position: 'relative', overflow: 'hidden',
    }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = highlight ? 'scale(1.12) translateY(-8px)' : 'scale(1.06) translateY(-4px)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
  >
    <div style={{ flex: 1, width: '100%' }}><DotGrid value={tile.v1} dotPx={6} /></div>
    <div style={{ height: 1, backgroundColor: '#9ca3af', margin: '0 6px', flexShrink: 0 }} />
    <div style={{ flex: 1, width: '100%' }}><DotGrid value={tile.v2} dotPx={6} /></div>
    {highlight && !disabled && (
      <div style={{ position: 'absolute', inset: 0, borderRadius: 10, boxShadow: 'inset 0 0 0 2px #facc15', pointerEvents: 'none' }} />
    )}
  </button>
);

// ─── DIMENSYON ────────────────────────────────────────────────────────────────
//
//  Chema serpentin:
//   [H][H][D][H][H][H][H][V]   D=doub (portrait nan ranje H)
//                          ↓
//   [H][H][H][H][D][H][H][V]
//   ↓
//   [H][H][H][H][H][H][H]
//
//  H = orizontal : TW lajè, TH wotè
//  D = doub      : TH lajè, TW wotè  (portrait, nan sant slot TW)
//  V = kwen      : TH lajè, TW wotè  (portrait, nan bout ranje)
//
//  TW = 46 (lajè long), TH = 24 (wotè kout)
//  Doub okipe slot TW men sèlman TH lajè (sentre)
//
const TW = 62;        // lajè tuil orizontal
const TH = 34;        // wotè tuil orizontal = lajè kwen/doub
const DP = 7;         // tay pwen
// BOARD_W kalkile dinamikman nan SnakeBoard

// ─── COMPOSANT DOMINO ─────────────────────────────────────────────────────────
//
//  DominoTile jere 3 ka:
//    horiz=true,  isDouble=false → [a | b]  TW × TH
//    horiz=false, isDouble=false → [a]      TH × TW  (kwen/vètikal)
//                                  [b]
//    isDouble=true, horiz=true   → portrait TH × TW, sentre nan slot TW
//    isDouble=true, horiz=false  → portrait TH × TW  (menm jan)
//
const DominoTile = ({ a, b, horiz = true, isDouble = false }) => {
  const dotPx = DP;

  // Tout doub yo toujou portrait (TH lajè × TW wotè)
  // Kwen yo toujou portrait (TH lajè × TW wotè)
  // Sèlman tuil nòmal orizontal ki TW × TH
  const isPortrait = isDouble || !horiz;

  const w = isPortrait ? TH : TW;
  const h = isPortrait ? TW : TH;

  const style = {
    display: 'flex',
    flexDirection: 'column',  // toujou column — on pivote les valeurs
    width: w, height: h,
    background: '#fefcf0',
    borderRadius: 5,
    border: '1.5px solid #c0b896',
    boxShadow: '0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.7)',
    overflow: 'hidden',
    flexShrink: 0,
  };

  // Pou tuil orizontal nòmal, fòk nou rotate — utilisé flex row
  if (!isPortrait) {
    return (
      <div style={{ ...style, flexDirection: 'row' }}>
        <div style={{ flex: 1 }}><DotGrid value={a} dotPx={dotPx} /></div>
        <div style={{ width: 1, backgroundColor: '#9a9080', margin: '4px 0', flexShrink: 0 }} />
        <div style={{ flex: 1 }}><DotGrid value={b} dotPx={dotPx} /></div>
      </div>
    );
  }

  // Portrait (doub oswa kwen vètikal)
  return (
    <div style={style}>
      <div style={{ flex: 1 }}><DotGrid value={a} dotPx={dotPx} /></div>
      <div style={{ height: 1, backgroundColor: '#9a9080', margin: '0 4px', flexShrink: 0 }} />
      <div style={{ flex: 1 }}><DotGrid value={b} dotPx={dotPx} /></div>
    </div>
  );
};


// ─── PLATEAU (chema foto referans) ──────────────────────────────────────────
//
//  Chema reyèl (foto matador):
//
//  [H][H][H][H][H][H][H][V]        ← ranje 1, kwen ADWAT
//                          [H][H]... ← ranje 2 kontinye ADWAT (aliye anba kwen)
//                          [V]       ← kwen 2 ADWAT
//                          [H]...    ← ranje 3 ADWAT toujou
//
//  ✦ Chak ranje toujou ale ADWAT (goch→dwat)
//  ✦ Kwen toujou ADWAT — li aliye bò dwat ranje anwo a
//  ✦ Ranje anba a kòmanse nan menm x ke kwen (bò dwat)
//  ✦ Tout ranje "monte" (justify-bottom) — ranje pi kout parèt anba
//
//  Layout final:
//    Ranje 1:  x=0..7*TW,  y=0
//    Kwen 1:   x=7*TW,     y=0    (wotè TW, debòde anba)
//    Ranje 2:  x=7*TW...,  y=TW   (kòmanse nan bò dwat kwen)
//    Kwen 2:   x=7*TW+len2*TW,    y=TW
//    etc.
//
//  Pou afichaj: nou kalkile y_max (ranje ki pi ba) epi nou flip tout y
//  pou ranje 1 parèt ANBA (align-bottom) — non, pito nou kite natirèl:
//  ranje 1 anwo, ranje 2 anba — menm jan ak foto
//
//  KWEN: v1=bò ki kole ak dènye tuil ranje anwo, v2=bò ki kole ak premye tuil ranje anba
//
const ROW_MAX  = 7;   // maks tuil orizontal pa ranje anvan kwen

const SnakeBoard = ({ board }) => {
  if (!board || board.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: 0.4, padding: '20px 0' }}>
        <div style={{ width: TW, height: TH, border: '2px dashed #34d399', borderRadius: 4 }} />
        <p style={{ color: '#34d399', fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase' }}>
          Jwe premye domino
        </p>
      </div>
    );
  }

  // ── Kalkile pozisyon chak tuil ─────────────────────────────────────────────
  //
  //  Kurseur:
  //    rowX  = x kote ranje aktyèl la kòmanse
  //    rowY  = y anwo ranje aktyèl
  //    cx    = x kurseur aktyèl (avanse adwat)
  //    seg   = kantite tuil H nan ranje aktyèl (0..ROW_MAX-1 nòmal, ROW_MAX = kwen)
  //
  //  Kwen: plase nan (cx, rowY), wotè TW, lajè TH
  //  Apre kwen: nouvo ranje kòmanse nan (cx, rowY + TW)
  //             cx rete menm (kwen ak ranje anba a aliye agoch)
  //             WAIT — nan foto, ranje anba kòmanse nan bò AGOCH kwen
  //             Kwen x = cx, ranje anba x = cx (menm x)
  //
  const items = [];
  let cx = 0;
  let rowY = 0;
  let seg = 0;

  for (let i = 0; i < board.length; i++) {
    const tile     = board[i];
    const isCorner = seg === ROW_MAX;
    const isDouble = tile.v1 === tile.v2;

    if (!isCorner) {
      // ── Tuil orizontal (oswa doub portrait) ──
      const a = tile.v1;  // v1 = bò antre (goch), v2 = bò soti (dwat)
      const b = tile.v2;

      if (isDouble) {
        // Doub portrait: lajè reyèl = TH (pa TW), sentre vètikal
        const dOffY = -Math.round((TW - TH) / 2);
        items.push({ tile, x: cx, y: rowY + dOffY, horiz: false, a, b, isDouble: true });
        cx += TH;  // avanse sèlman TH (lajè reyèl doub) — elimine gap
      } else {
        items.push({ tile, x: cx, y: rowY, horiz: true, a, b, isDouble: false });
        cx += TW;
      }
      seg += 1;

    } else {
      // ── Kwen vètikal ADWAT ──
      // Plase jis apre dènye tuil H (cx = x kwen)
      // v1 = bò ki kole ak ranje anwo (antre pa wotè)
      // v2 = bò ki kole ak ranje anba (soti pa ba)
      items.push({ tile, x: cx, y: rowY, horiz: false, a: tile.v1, b: tile.v2, isDouble: false });

      // Nouvo ranje: kòmanse anba kwen
      rowY += TW;
      // cx pou nouvo ranje = menm x ke kwen (bò agoch kwen)
      cx   = items[items.length - 1].x;
      seg  = 0;
    }
  }

  // ── Bounding box ──────────────────────────────────────────────────────────
  let maxX = 0, maxY = 0, minY = 0;
  for (const it of items) {
    const w = it.horiz ? TW : TH;
    const h = it.horiz ? TH : TW;
    maxX = Math.max(maxX, it.x + w);
    maxY = Math.max(maxY, it.y + h);
    minY = Math.min(minY, it.y);
  }
  const offsetAll = minY < 0 ? -minY : 0;
  const totalH    = maxY + offsetAll;

  return (
    <div style={{ position: 'relative', width: maxX, height: totalH }}>
      {items.map(({ tile, x: ix, y: iy, horiz, a, b, isDouble }, idx) => (
        <div key={tile.id || idx} style={{ position: 'absolute', left: ix, top: iy + offsetAll }}>
          <DominoTile a={a} b={b} horiz={horiz} isDouble={isDouble} />
        </div>
      ))}
    </div>
  );
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
const showToast = (msg, color = 'bg-gray-800', duration = 3000) => {
  const el = document.createElement('div');
  el.className = `fixed top-6 left-1/2 -translate-x-1/2 ${color} text-white px-5 py-3 rounded-2xl shadow-2xl z-[9999] text-sm font-semibold flex items-center gap-2`;
  el.innerHTML = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
};

// ─── COMPOSANT PRINCIPAL ──────────────────────────────────────────────────────
const MultiplayerGame = ({ gameData, currentUser, onExit }) => {
  const [loading, setLoading]       = useState(true);
  const [gameState, setGameState]   = useState(null);
  const [myHand, setMyHand]         = useState([]);
  const [result, setResult]         = useState(null);
  const [playable, setPlayable]     = useState([]);
  const [pendingPlacement, setPendingPlacement] = useState(null);

  const [opponentOnline, setOpponentOnline]       = useState(true);
  const [opponentDiscoAt, setOpponentDiscoAt]     = useState(null);
  const [, setMyConnected]                         = useState(true);
  const [showNetworkAlert, setShowNetworkAlert]   = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  const resultHandled   = useRef(false);
  const tokensUpdated   = useRef(false);
  const presenceCleanup = useRef(null);

  const gameRef        = ref(database, `games/${gameData.sessionId}`);
  const opponentUid    = currentUser.uid === gameData.player1Uid ? gameData.player2Uid    : gameData.player1Uid;
  const opponentPseudo = currentUser.uid === gameData.player1Uid ? gameData.player2Pseudo : gameData.player1Pseudo;
  const myPseudo       = currentUser.uid === gameData.player1Uid ? gameData.player1Pseudo : gameData.player2Pseudo;

  // ─── INIT ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const initGame = async () => {
      if (currentUser.uid !== gameData.player1Uid) return;
      const snap = await get(gameRef);
      if (snap.exists()) return;
      const deck = shuffleDeck(generateDeck());
      await set(gameRef, {
        status: 'playing', board: [], deck: deck.slice(14),
        turn: gameData.player1Uid, lastAction: null,
        consecutivePasses: 0, winner: null, winType: null,
        startedAt: Date.now(), paused: false,
        hands: {
          [gameData.player1Uid]: deck.slice(0, 7),
          [gameData.player2Uid]: deck.slice(7, 14),
        },
      });
    };
    initGame();
  }, []); // eslint-disable-line

  // ─── PRÉSENCE ────────────────────────────────────────────────────────────
  useEffect(() => {
    const connectedRef   = ref(database, '.info/connected');
    const myPresenceRef  = ref(database, `gamePresence/${gameData.sessionId}/${currentUser.uid}`);
    const oppPresenceRef = ref(database, `gamePresence/${gameData.sessionId}/${opponentUid}`);

    const unsubConn = onValue(connectedRef, async (snap) => {
      const connected = snap.val();
      setMyConnected(connected);
      if (connected) {
        setShowNetworkAlert(false);
        await set(myPresenceRef, { online: true, lastSeen: Date.now() });
        onDisconnect(myPresenceRef).set({ online: false, lastSeen: serverTimestamp() });
      } else {
        setShowNetworkAlert(true);
        showToast('⚠️ Koneksyon ou feb — ap eseye rekonekte...', 'bg-orange-600', 6000);
      }
    });

    const unsubOpp = onValue(oppPresenceRef, (snap) => {
      const data = snap.val();
      if (!data) return;
      const isOnline = data.online === true;
      setOpponentOnline(prev => {
        if (!isOnline && prev) {
          setOpponentDiscoAt(Date.now());
          showToast(`${opponentPseudo} pedi koneksyon...`, 'bg-orange-700', 5000);
          const timer = setTimeout(async () => {
            const fresh = (await get(oppPresenceRef)).val();
            if (!fresh || fresh.online === false) {
              showToast(`${opponentPseudo} dekonekte twop lontan — ou genyen!`, 'bg-green-600', 5000);
              await finishGame(currentUser.uid, 'forfait');
            }
          }, 30000);
          presenceCleanup.current = timer;
        }
        if (isOnline && !prev) {
          setOpponentDiscoAt(null);
          clearTimeout(presenceCleanup.current);
          showToast(`${opponentPseudo} rekonekte!`, 'bg-green-700', 3000);
        }
        return isOnline;
      });
    });

    return () => {
      unsubConn(); unsubOpp();
      clearTimeout(presenceCleanup.current);
      set(myPresenceRef, { online: false, lastSeen: Date.now() }).catch(() => {});
    };
  }, []); // eslint-disable-line

  // ─── ÉCOUTE JEU ──────────────────────────────────────────────────────────
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

  // ─── MISE À JOUR JETONS ───────────────────────────────────────────────────
  useEffect(() => {
    if (!result || tokensUpdated.current) return;
    tokensUpdated.current = true;
    const bet = parseInt(gameData.bet);
    const myTokenRef = ref(database, `users/${currentUser.uid}/tokens`);
    get(myTokenRef).then(snap => {
      const current = snap.val() || 0;
      return set(myTokenRef, result.won ? current + bet : Math.max(0, current - bet));
    }).catch(e => console.error('Token update:', e));
  }, [result]); // eslint-disable-line

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

  // ─── FIN DE PARTIE ────────────────────────────────────────────────────────
  const finishGame = useCallback(async (winnerUid, winType) => {
    try { await update(gameRef, { status: 'finished', winner: winnerUid, winType, finishedAt: Date.now() }); }
    catch (e) { console.error('finishGame:', e); }
  }, [gameRef]);

  // ─── CONSTRUIRE TUILE ORIENTÉE ───────────────────────────────────────────
  const buildOrientedTile = (rawTile, side, board) => {
    if (board.length === 0) return { ...rawTile };
    const leftEnd  = board[0].v1;
    const rightEnd = board[board.length - 1].v2;

    if (side === 'right') {
      if (rawTile.v1 === rightEnd) return { ...rawTile };
      return { ...rawTile, v1: rawTile.v2, v2: rawTile.v1 };
    } else {
      if (rawTile.v2 === leftEnd) return { ...rawTile };
      return { ...rawTile, v1: rawTile.v2, v2: rawTile.v1 };
    }
  };

  // ─── JOUER AVEC DIRECTION ────────────────────────────────────────────────
  const playTileToSide = async (tileIdx, forcedSide) => {
    const rawTile   = myHand[tileIdx];
    const board     = gameState.board || [];
    const finalTile = buildOrientedTile(rawTile, forcedSide, board);
    const newHand   = myHand.filter((_, i) => i !== tileIdx);
    const newBoard  = forcedSide === 'left' ? [finalTile, ...board] : [...board, finalTile];

    await update(gameRef, {
      board: newBoard,
      [`hands/${currentUser.uid}`]: newHand,
      turn: opponentUid,
      consecutivePasses: 0,
      lastAction: { by: currentUser.uid, type: 'played', tile: finalTile },
    });
    if (newHand.length === 0) await finishGame(currentUser.uid, 'tombe');
  };

  // ─── CLIC SUR TUILE ───────────────────────────────────────────────────────
  const handlePlayTile = (idx) => {
    if (gameState?.turn !== currentUser.uid || !gameState) return;
    if (!playable.includes(idx)) return;
    const tile  = myHand[idx];
    const board = gameState.board || [];
    if (board.length === 0) { playTileToSide(idx, 'right'); return; }
    const leftEnd  = board[0].v1;
    const rightEnd = board[board.length - 1].v2;
    const fitsLeft  = tile.v1 === leftEnd  || tile.v2 === leftEnd;
    const fitsRight = tile.v1 === rightEnd || tile.v2 === rightEnd;
    if (fitsLeft && fitsRight) {
      setPendingPlacement({ tileIdx: idx, tile });
    } else if (fitsRight) {
      playTileToSide(idx, 'right');
    } else {
      playTileToSide(idx, 'left');
    }
  };

  // ─── PIL ──────────────────────────────────────────────────────────────────
  const handleDraw = async () => {
    if (gameState?.turn !== currentUser.uid || !gameState) return;
    const deck = gameState.deck || [];
    if (deck.length > 0) {
      const newDeck = [...deck];
      const drawn   = newDeck.pop();
      const newHand = [...myHand, drawn];
      const board   = gameState.board || [];
      let drawnPlayable = board.length === 0;
      if (!drawnPlayable) {
        const leftEnd  = board[0].v1;
        const rightEnd = board[board.length - 1].v2;
        drawnPlayable = drawn.v1 === leftEnd || drawn.v2 === leftEnd || drawn.v1 === rightEnd || drawn.v2 === rightEnd;
      }
      if (drawnPlayable) {
        await update(gameRef, {
          deck: newDeck, [`hands/${currentUser.uid}`]: newHand,
          consecutivePasses: 0,
          lastAction: { by: currentUser.uid, type: 'drew_can_play', tile: drawn },
        });
        showToast('Domino ou pran an ka jwe! Jwe li.', 'bg-green-700', 3000);
      } else {
        await update(gameRef, {
          deck: newDeck, [`hands/${currentUser.uid}`]: newHand,
          turn: opponentUid, consecutivePasses: 0,
          lastAction: { by: currentUser.uid, type: 'drew_passed', tile: drawn },
        });
      }
    } else {
      const newPasses = (gameState.consecutivePasses || 0) + 1;
      await update(gameRef, {
        consecutivePasses: newPasses, turn: opponentUid,
        lastAction: { by: currentUser.uid, type: 'passed' },
      });
      if (newPasses >= 2) {
        const opHand = gameState.hands?.[opponentUid] || [];
        await finishGame(sumHand(myHand) <= sumHand(opHand) ? currentUser.uid : opponentUid, 'blokaj');
      }
    }
  };

  // ─── ABANDON ─────────────────────────────────────────────────────────────
  const handleAbandonConfirm = async () => {
    setShowAbandonConfirm(false);
    await finishGame(opponentUid, 'abandon');
  };

  // ─── EXIT ─────────────────────────────────────────────────────────────────
  const handleExit = useCallback(async () => {
    try { await remove(gameRef); } catch (_) {}
    try { await remove(ref(database, `gamePresence/${gameData.sessionId}`)); } catch (_) {}
    onExit();
  }, [gameRef, gameData.sessionId, onExit]);

  // ─── RENDER ───────────────────────────────────────────────────────────────
  if (loading || !gameState) {
    return (
      <div className="fixed inset-0 bg-emerald-950 flex flex-col items-center justify-center z-[150]">
        <div className="w-16 h-16 rounded-full border-4 border-emerald-700 border-t-emerald-300 animate-spin" />
        <p className="text-emerald-300 mt-4 font-semibold tracking-wider text-sm">Chajman jwet...</p>
      </div>
    );
  }

  const isMyTurn          = gameState.turn === currentUser.uid;
  const opponentHandCount = gameState.hands?.[opponentUid]?.length ?? 7;
  const deckCount         = gameState.deck?.length || 0;
  const board             = gameState.board || [];
  const hasPlayable       = playable.length > 0;
  const lastAction        = gameState.lastAction;
  const discoSeconds      = opponentDiscoAt ? Math.floor((Date.now() - opponentDiscoAt) / 1000) : 0;
  const justDrewCanPlay   = lastAction?.by === currentUser.uid && lastAction?.type === 'drew_can_play';

  return (
    <div className="fixed inset-0 z-[150] flex flex-col overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at top, #064e3b 0%, #022c22 60%, #011a15 100%)' }}>

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle,#34d399,transparent)' }} />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle,#059669,transparent)' }} />
      </div>

      {showNetworkAlert && (
        <div className="relative z-20 bg-orange-600 text-white text-center text-xs py-2 px-4 flex items-center justify-center gap-2 animate-pulse">
          <WifiOff className="w-4 h-4" /><span>Koneksyon ou feb — ap eseye rekonekte...</span>
        </div>
      )}
      {!opponentOnline && (
        <div className="relative z-20 bg-yellow-500 text-black text-center text-xs py-2 px-4 flex items-center justify-center gap-2 font-semibold">
          <Wifi className="w-4 h-4" />
          <span>{opponentPseudo} dekonekte — ap tann ({Math.max(0, 30 - discoSeconds)}s avan forfe)</span>
        </div>
      )}

      {/* ══ HEADER ══ */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(52,211,153,0.15)' }}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${opponentOnline ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gray-600'}`}>
              <User className="w-5 h-5 text-white" />
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-emerald-950 ${opponentOnline ? 'bg-green-400' : 'bg-red-500 animate-pulse'}`} />
            {gameState.turn === opponentUid && opponentOnline && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-yellow-400 animate-ping" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-white font-bold text-sm leading-none">{opponentPseudo}</p>
              <span className={`text-[9px] font-bold ${opponentOnline ? 'text-green-400' : 'text-red-400'}`}>
                {opponentOnline ? '● EN LIGN' : '● DEKONEKTE'}
              </span>
            </div>
            <div className="flex gap-[3px] mt-1 items-center">
              {Array.from({ length: Math.min(opponentHandCount, 10) }, (_, i) => (
                <div key={i} style={{ width: 8, height: 18, borderRadius: 2, background: '#065f46', border: '1px solid #047857', flexShrink: 0 }} />
              ))}
              <span className="text-emerald-400 text-xs ml-1 font-bold">{opponentHandCount}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-yellow-500/20 border border-yellow-500/40 rounded-xl px-3 py-1.5">
          <Coins className="w-4 h-4 text-yellow-400" />
          <span className="text-yellow-300 font-bold text-sm">{gameData.bet}</span>
        </div>
        <div className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all ${gameState.turn === opponentUid ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30' : 'bg-white/10 text-white/50'}`}>
          {gameState.turn === opponentUid ? '⚡ TOU LI' : 'TANN...'}
        </div>
      </div>

      {/* ══ ZONE PLATEAU ══ */}
      <div className="relative flex-1 flex flex-col" style={{ overflow: 'hidden', minHeight: 0 }}>
        {/* Notifikasyon aksyon */}
        {lastAction && lastAction.by === opponentUid && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-1 rounded-full border border-white/10 shadow-lg whitespace-nowrap">
            {lastAction.type === 'played'      && `${opponentPseudo} jwe [${lastAction.tile?.v1}|${lastAction.tile?.v2}]`}
            {lastAction.type === 'drew'        && `${opponentPseudo} pran yon domino`}
            {lastAction.type === 'drew_passed' && `${opponentPseudo} pran + pase`}
            {lastAction.type === 'passed'      && `${opponentPseudo} pase (pil vid)`}
          </div>
        )}
        {justDrewCanPlay && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-green-700 text-white text-xs px-3 py-1 rounded-full border border-green-500 shadow-lg whitespace-nowrap animate-pulse">
            Domino ou pran an ka jwe — jwe li!
          </div>
        )}

        {/* ── PLATO: pran tout espas, sentre SnakeBoard ── */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: '#065f46 rgba(0,0,0,0.1)',
        }}>
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.08, pointerEvents: 'none',
            background: 'repeating-linear-gradient(45deg,#065f46 0px,#065f46 1px,transparent 1px,transparent 12px)',
          }} />
          <SnakeBoard board={board} />
        </div>

        {/* ── Stats: NAN PIL / SOU PLATO — tout anba ── */}
        <div className="flex gap-2 justify-center pb-2 pt-1" style={{ flexShrink: 0 }}>
          <div className="flex items-center gap-1 text-xs text-emerald-400 bg-black/30 rounded-full px-2.5 py-0.5">
            <span className="font-bold">{deckCount}</span><span className="opacity-70">nan PIL</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-emerald-400 bg-black/30 rounded-full px-2.5 py-0.5">
            <span className="font-bold">{board.length}</span><span className="opacity-70">sou plato</span>
          </div>
          {(gameState.consecutivePasses || 0) > 0 && (
            <div className="text-xs text-orange-400 bg-orange-500/10 rounded-full px-2.5 py-0.5 border border-orange-500/30">
              ⚠️ {gameState.consecutivePasses} pas
            </div>
          )}
        </div>
      </div>

      {/* ══ MAIN ══ */}
      <div className="relative z-10"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(52,211,153,0.15)' }}>
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow">
                <User className="w-4 h-4 text-white" />
              </div>
              {isMyTurn && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-yellow-400 border-2 border-black animate-pulse" />}
            </div>
            <span className="text-white font-bold text-sm">{myPseudo}</span>
            <span className="text-emerald-400 text-xs">({myHand.length} kart)</span>
          </div>
          <div className={`text-xs font-black px-4 py-1.5 rounded-full transition-all duration-300 ${isMyTurn ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/40 scale-105' : 'bg-white/10 text-white/40'}`}>
            {isMyTurn ? '⚡ TOU OU' : 'TANN...'}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto px-3 py-2 items-end justify-center"
          style={{ scrollbarWidth: 'none', minHeight: 96 }}>
          {myHand.length === 0
            ? <p className="text-emerald-400 text-sm italic py-6">Men ou vid...</p>
            : myHand.map((tile, i) => (
              <HandDomino
                key={tile.id || i} tile={tile}
                onClick={() => handlePlayTile(i)}
                disabled={!isMyTurn}
                highlight={isMyTurn && playable.includes(i)}
              />
            ))
          }
        </div>

        <div className="flex gap-3 px-4 pb-4 pt-1">
          <button onClick={handleDraw} disabled={!isMyTurn || hasPlayable}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${isMyTurn && !hasPlayable ? 'bg-orange-500 hover:bg-orange-400 text-white shadow-lg active:scale-95' : 'bg-white/5 text-white/20 cursor-not-allowed'}`}>
            <RotateCcw className="w-4 h-4" />
            {deckCount > 0 ? 'PIL' : 'Pase Tou'}
          </button>
          <button onClick={() => setShowAbandonConfirm(true)}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-red-600/80 hover:bg-red-500 text-white font-bold text-sm transition-all active:scale-95">
            <ArrowLeft className="w-4 h-4" /> Kite
          </button>
        </div>
      </div>

      {/* ══ POPUP CHOIX CÔTÉ ══ */}
      {pendingPlacement && (
        <div className="fixed inset-0 z-[220] flex items-end justify-center pb-48"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setPendingPlacement(null)}>
          <div className="bg-gray-900 border border-yellow-500/40 rounded-2xl p-5 shadow-2xl text-center"
            onClick={e => e.stopPropagation()}>
            <p className="text-yellow-300 font-bold text-sm mb-4">
              Ki kote wap poze [{pendingPlacement.tile.v1}|{pendingPlacement.tile.v2}]?
            </p>
            <div className="flex gap-4 justify-center">
              <button onClick={() => { playTileToSide(pendingPlacement.tileIdx, 'left'); setPendingPlacement(null); }}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all active:scale-95">
                <ArrowLeftCircle className="w-5 h-5" /> Goch
              </button>
              <button onClick={() => { playTileToSide(pendingPlacement.tileIdx, 'right'); setPendingPlacement(null); }}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition-all active:scale-95">
                Dwat <ArrowRightCircle className="w-5 h-5" />
              </button>
            </div>
            <button onClick={() => setPendingPlacement(null)} className="mt-3 text-gray-500 text-xs hover:text-gray-300">Anile</button>
          </div>
        </div>
      )}

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
              <p className="text-red-300 text-sm font-semibold mb-2">Si ou kite jeu a kounye a :</p>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>• {opponentPseudo} ap <span className="text-green-400 font-bold">genyen pa forfe</span></li>
                <li>• Ou ap <span className="text-red-400 font-bold">pedi {gameData.bet} jeton</span></li>
                <li>• Rezilta a pap chanje</li>
              </ul>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowAbandonConfirm(false)} className="flex-1 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold text-sm">Kontinye Jwe</button>
              <button onClick={handleAbandonConfirm} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm">Abandone (-{gameData.bet})</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL RÉSULTAT ══ */}
      {result && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
          <div className={`w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl ${result.won ? 'border-2 border-yellow-400/60' : 'border-2 border-gray-600/40'}`}
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
                      <div key={i} className={`absolute ${pos} text-yellow-300 text-lg animate-bounce`} style={{ animationDelay: `${i * 0.15}s` }}>✦</div>
                    ))}
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gray-700/50 border-2 border-gray-600/40 flex items-center justify-center">
                    <Skull className="w-12 h-12 text-gray-400" />
                  </div>
                )}
              </div>
              <h2 className={`text-3xl font-black mb-1 tracking-tight ${result.won ? 'text-yellow-300' : 'text-gray-300'}`}>
                {result.won ? (result.type === 'blokaj' ? 'Ou Genyen!' : (result.type === 'forfait' || result.type === 'abandon') ? 'Forfe!' : 'OU TONBE!') : (result.type === 'abandon' ? 'Ou Abandone...' : 'Ou Pedi...')}
              </h2>
              <p className="text-sm mb-6 opacity-60 text-white">
                {result.type === 'tombe'   &&  result.won && 'Men ou te vid — viktorya!'}
                {result.type === 'tombe'   && !result.won && `${opponentPseudo} fini anvan ou`}
                {result.type === 'blokaj'  && 'Pati bloke — mwens pwen genyen'}
                {result.type === 'forfait' &&  result.won && `${opponentPseudo} dekonekte twop lontan`}
                {result.type === 'abandon' &&  result.won && `${opponentPseudo} abandone pati a`}
                {result.type === 'abandon' && !result.won && 'Ou kite pati a — penalite aplike'}
              </p>
              <div className={`rounded-2xl p-5 mb-4 ${result.won ? 'bg-gradient-to-r from-yellow-500/20 to-amber-500/10 border border-yellow-500/30' : 'bg-red-900/20 border border-red-800/30'}`}>
                <div className={`text-4xl font-black ${result.won ? 'text-yellow-300' : 'text-red-400'}`}>
                  {result.won ? `+${result.amount}` : `-${result.amount}`}
                </div>
                <div className="flex items-center justify-center gap-1 mt-1 opacity-60">
                  <Coins className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-white">Jeton</span>
                </div>
                {result.won && <p className="text-xs text-yellow-400/70 mt-2">Mise ou ({result.amount}) + mise advese ({result.amount}) = +{result.amount} net</p>}
              </div>
              <button onClick={handleExit}
                className={`w-full py-4 rounded-2xl font-black text-base transition-all active:scale-95 ${result.won ? 'bg-gradient-to-r from-yellow-400 to-amber-400 text-black hover:from-yellow-300 shadow-lg shadow-yellow-500/30' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}>
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