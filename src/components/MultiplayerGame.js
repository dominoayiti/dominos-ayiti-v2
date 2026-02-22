import React, { useState, useEffect } from 'react';
import { Loader, User, Coins, ArrowLeft, RotateCcw, Skull, TrendingDown } from 'lucide-react';
import { database } from '../firebase-config';
import { ref, set, onValue, update, get } from 'firebase/database';

// 🎮 --- CONSTANTES & UTILITAIRES ---
const generateDeck = () => {
  const deck = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      deck.push({ v1: i, v2: j, id: `${i}-${j}` });
    }
  }
  return deck;
};

const shuffleDeck = (deck) => {
  let newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

const MultiplayerGame = ({ gameData, currentUser, onExit }) => {
  // --- ÉTATS DU JEU ---
  const [loading, setLoading] = useState(true);
  const [gameState, setGameState] = useState(null); 
  const [myHand, setMyHand] = useState([]); 

  // --- POPUPS ---
  const [showWinModal, setShowWinModal] = useState(false);
  const [showLossModal, setShowLossModal] = useState(false);
  const [gameResult, setGameResult] = useState(null); 

  // Référence Firebase
  const gameRef = ref(database, `games/${gameData.sessionId}`);

  // --- 1. INITIALISATION DU JEU ---
  useEffect(() => {
    const initGame = async () => {
      const snapshot = await get(gameRef);
      if (snapshot.exists()) {
        console.log('🎮 Le jeu existe déjà, chargement...');
        return; 
      }

      // Créer le jeu
      const deck = shuffleDeck(generateDeck());
      const p1Hand = deck.slice(0, 7);
      const p2Hand = deck.slice(7, 14);
      const gameDeck = deck.slice(14); 

      const initialGameState = {
        status: 'playing',
        board: [], 
        deck: gameDeck,
        turn: gameData.player1Uid,
        lastAction: null,
        consecutivePasses: 0,
        startedAt: Date.now()
      };

      try {
        await set(gameRef, initialGameState);
        
        await update(gameRef, {
          [`hands/${gameData.player1Uid}`]: p1Hand,
          [`hands/${gameData.player2Uid}`]: p2Hand
        });

        console.log('✅ Jeu initialisé');
      } catch (error) {
        console.error('❌ Erreur init jeu:', error);
      }
    };

    initGame();
  }, [gameData, gameRef]);

  // --- 2. ÉCOUTER L'ÉTAT DU JEU ---
  useEffect(() => {
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      
      if (!data) {
        setLoading(false);
        return;
      }

      setLoading(false);
      setGameState(data);

      // Mettre à jour ma main
      if (data.hands && data.hands[currentUser.uid]) {
        setMyHand(data.hands[currentUser.uid]);
      }
    });

    return () => unsubscribe();
  }, [gameRef, currentUser]);

  // --- 3. LOGIQUE DE JEU ---
  const isMyTurn = gameState && gameState.turn === currentUser.uid;

  const handleDraw = async () => {
    if (!isMyTurn || !gameState || !gameState.deck || gameState.deck.length === 0) return;

    let newDeck = [...gameState.deck];
    let newHand = [...myHand];
    let action = 'passed';
    
    let drawnTile = null;
    if (newDeck.length > 0) {
      drawnTile = newDeck.pop();
      newHand.push(drawnTile);
      action = 'drew';
    } else {
      const newPassCount = (gameState.consecutivePasses || 0) + 1;
      
      try {
        const opponentUid = currentUser.uid === gameData.player1Uid ? gameData.player2Uid : gameData.player1Uid;
        await update(gameRef, {
          consecutivePasses: newPassCount,
          turn: opponentUid,
          lastAction: { by: currentUser.uid, type: 'passed' }
        });
      } catch (e) {
        console.error("Erreur passe:", e);
      }
      return;
    }

    try {
      const opponentUid = currentUser.uid === gameData.player1Uid ? gameData.player2Uid : gameData.player1Uid;
      await update(gameRef, {
        deck: newDeck,
        [`hands/${currentUser.uid}`]: newHand,
        turn: opponentUid,
        consecutivePasses: 0,
        lastAction: { by: currentUser.uid, type: action, tile: drawnTile }
      });
    } catch (error) {
      console.error('❌ Erreur pioche:', error);
    }
  };

  const handlePlayTile = async (tileIndex) => {
    if (!isMyTurn || !gameState) return;

    const tileToPlay = myHand[tileIndex]; 
    const board = gameState.board || [];

    let isValid = false;
    let position = 'left'; 
    let rotationNeeded = false;
    
    if (board.length === 0) {
      isValid = true;
    } else {
      const leftEnd = board[0].v1; 
      const rightEnd = board[board.length - 1].v2;
      
      if (tileToPlay.v1 === rightEnd || tileToPlay.v2 === rightEnd) {
        isValid = true;
        position = 'right';
        if (tileToPlay.v2 === rightEnd) rotationNeeded = true;
      } else if (tileToPlay.v1 === leftEnd || tileToPlay.v2 === leftEnd) {
        isValid = true;
        position = 'left';
        if (tileToPlay.v1 === leftEnd) rotationNeeded = true;
      }
    }

    if (!isValid) {
      return;
    }

    let finalTile = { ...tileToPlay };
    if (rotationNeeded) {
      const temp = finalTile.v1;
      finalTile.v1 = finalTile.v2;
      finalTile.v2 = temp;
    }

    const newHand = myHand.filter((_, i) => i !== tileIndex);
    
    let newBoard = [...board];
    if (position === 'left') {
       newBoard.unshift(finalTile);
    } else {
       newBoard.push(finalTile);
    }
    
    if (newHand.length === 0) {
      checkWinCondition(currentUser.uid, 'tombe');
    }
    
    try {
      const opponentUid = currentUser.uid === gameData.player1Uid ? gameData.player2Uid : gameData.player1Uid;
      
      await update(gameRef, {
        board: newBoard,
        [`hands/${currentUser.uid}`]: newHand,
        turn: opponentUid,
        consecutivePasses: 0,
        lastAction: { by: currentUser.uid, type: 'played', tile: finalTile }
      });
      
    } catch (error) {
      console.error('❌ Erreur coup:', error);
    }
  };

  const checkWinCondition = (winnerUid, type) => {
    const bet = parseInt(gameData.bet);
    setGameResult({ winner: winnerUid, type: type, amount: bet });
    
    if (winnerUid === currentUser.uid) {
      setShowWinModal(true);
    } else {
      setShowLossModal(true);
    }
  };

  const handleGameEnd = async (winnerUid) => {
    const bet = parseInt(gameData.bet);
    const iWon = winnerUid === currentUser.uid;
    
    try {
      const userRef = ref(database, `users/${currentUser.uid}/tokens`);
      const snapshot = await get(userRef);
      const currentTokens = snapshot.val();
      
      if (iWon) {
        await set(userRef, (currentTokens || 0) + bet);
      } else {
        await set(userRef, Math.max(0, (currentTokens || 0) - bet));
      }
    } catch (e) {
      console.error("Erreur maj jetons:", e);
    }
    
    onExit();
  };

  // --- 4. AFFICHAGE ---
  if (loading || !gameState) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[150]">
        <Loader className="w-12 h-12 text-white animate-spin" />
      </div>
    );
  }

  const opponentUid = currentUser.uid === gameData.player1Uid ? gameData.player2Uid : gameData.player1Uid;
  const opponentPseudo = currentUser.uid === gameData.player1Uid ? gameData.player2Pseudo : gameData.player1Pseudo;
  const myPseudo = currentUser.uid === gameData.player1Uid ? gameData.player1Pseudo : gameData.player2Pseudo;
  
  // ✅ CALCUL DU COMPTEUR ADVERSAIRE EN TOUTE SÉCURITÉ
  const opponentHandCount = gameState.hands && gameState.hands[opponentUid] ? gameState.hands[opponentUid].length : 7;

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 flex flex-col z-[150]">
      
      {/* HEADER: ADVERSAIRE */}
      <div className="bg-green-950 p-2 flex justify-between items-center shadow-md border-b border-green-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">{opponentPseudo}</p>
            <div className="flex items-center gap-1">
              <Coins className="w-3 h-3 text-yellow-500" />
              <span className="text-gray-400 text-xs">{gameData.bet} jetons</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs">Cartes: {opponentHandCount}</span>
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${gameState.turn === opponentUid ? 'bg-yellow-500 text-black animate-pulse' : 'bg-gray-700 text-white'}`}>
            {gameState.turn === opponentUid ? 'Tou Jwe...' : 'Tann...'}
          </div>
        </div>
      </div>

      {/* ZONE DE JEU (PLATEAU) */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden relative">
        
        <div className="bg-green-700 w-full max-w-4xl h-64 rounded-xl border-4 border-green-600 shadow-2xl flex items-center justify-center overflow-x-auto overflow-y-hidden p-4 relative">
          
          {/* ✅ SÉCURITÉ SUR board ET deck */}
          {(gameState.board || []).length === 0 ? (
            <p className="text-green-300 opacity-50 font-bold italic">Atann yon domino...</p>
          ) : (
            <div className="flex gap-1 items-center">
              {(gameState.board || []).map((tile, index) => (
                <div 
                    key={index} 
                    className="bg-white rounded shadow-md w-10 h-20 flex flex-col items-center justify-between border border-gray-300 relative shrink-0"
                >
                  <div className="w-2 h-2 bg-black rounded-full mx-auto"></div>
                  <div className="w-8 h-8 bg-gray-100 my-0.5 rounded"></div>
                  <div className="w-2 h-2 bg-black rounded-full mx-auto"></div>
                  <span className="absolute top-1 left-1 text-[8px] font-bold">{tile.v1}</span>
                  <span className="absolute bottom-1 right-1 text-[8px] font-bold">{tile.v2}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-2 text-green-200 text-xs">
          Pioche restante: {gameState.deck?.length || 0}
        </div>

      </div>

      {/* MAIN DU JOUEUR */}
      <div className="bg-green-950/90 backdrop-blur p-4 pt-2 border-t border-green-800">
        <div className="flex justify-between items-center mb-2 px-2">
          <span className="text-white font-bold text-sm">{myPseudo}</span>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${isMyTurn ? 'bg-yellow-500 text-black shadow-lg' : 'bg-gray-600 text-white'}`}>
            {isMyTurn ? 'A OU' : 'TANN'}
          </span>
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-4 justify-center items-center min-h-[100px]">
          {/* ✅ SÉCURITÉ SUR myHand */}
          {(myHand || []).map((tile, index) => (
            <button
              key={tile.id}
              onClick={() => handlePlayTile(index)}
              disabled={!isMyTurn}
              className={`bg-white rounded shadow-lg w-12 h-24 flex flex-col items-center justify-between border-2 transition-transform transform hover:scale-110 active:scale-95 ${
                isMyTurn ? 'border-yellow-400 cursor-pointer' : 'border-gray-400 cursor-not-allowed opacity-70'
              }`}
            >
              <div className="w-2 h-2 bg-gray-800 rounded-full mt-1"></div>
              <div className="flex flex-col items-center justify-center h-full w-full py-1 gap-0.5">
                 <span className="text-[10px] font-bold text-black">{tile.v1}</span>
                 <div className="w-px h-2 bg-gray-400"></div>
                 <span className="text-[10px] font-bold text-black">{tile.v2}</span>
              </div>
              <div className="w-2 h-2 bg-gray-800 rounded-full mb-1"></div>
            </button>
          ))}
        </div>

        <div className="flex justify-center gap-4 mt-2">
          <button 
            onClick={handleDraw}
            disabled={!isMyTurn}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-colors ${
              isMyTurn ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-md' : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            Pioche (Pase)
          </button>
          
          <button 
            onClick={onExit}
            className="flex items-center gap-2 px-6 py-2 rounded-lg font-bold bg-red-600 hover:bg-red-700 text-white text-sm shadow-md"
          >
            <ArrowLeft className="w-4 h-4" />
            Kite
          </button>
        </div>
      </div>

      {/* MODAL VICTOIRE */}
      {showWinModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl border-4 border-yellow-400">
            <div className="mb-4 flex justify-center">
              {gameResult.type === 'djapot' ? (
                <span className="text-6xl animate-bounce">🎉</span>
              ) : (
                <span className="text-6xl">🏆</span>
              )}
            </div>
            
            <h2 className={`text-3xl font-bold mb-2 ${gameResult.type === 'djapot' ? 'text-yellow-600' : 'text-green-600'}`}>
              {gameResult.type === 'djapot' ? 'OU FE DJAPOT !!' : 'OU TONBE !'}
            </h2>
            
            <p className="text-gray-600 mb-6">
              {gameResult.type === 'djapot' ? 'Jackpot! Gwo chans ou!' : 'Ou genyen pati la!'}
            </p>

            <div className="bg-green-100 border-2 border-green-500 rounded-2xl p-6 mb-6 shadow-inner">
              <p className="text-green-800 font-bold text-3xl">
                +{gameResult.amount} Jetons
              </p>
            </div>

            <button 
              onClick={() => handleGameEnd(currentUser.uid)}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-2xl w-full shadow-lg text-lg transition-transform hover:scale-105"
            >
              Retourner Lobby
            </button>
          </div>
        </div>
      )}

      {/* MODAL DEFAITE */}
      {showLossModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border-2 border-gray-200">
            <div className="mb-4">
              <Skull className="w-20 h-20 text-gray-400 mx-auto animate-pulse" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              Ou Pedi...
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {opponentPseudo} te genyen!
            </p>

            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 mb-6 flex flex-col items-center">
              <TrendingDown className="w-10 h-10 text-red-500 mb-2" />
              <p className="text-red-600 font-bold text-3xl font-mono">
                -{gameResult.amount}
              </p>
              <p className="text-xs text-red-400 font-bold uppercase tracking-wider mt-1">Jetons Perdu</p>
            </div>

            <button 
              onClick={() => handleGameEnd(opponentUid)}
              className="bg-gray-800 hover:bg-gray-900 text-white font-bold py-3 px-8 rounded-xl w-full transition-colors"
            >
              Retourner Lobby
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default MultiplayerGame;