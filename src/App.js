import React, { useState } from 'react';
import { Sparkles, Trophy, Users, Coins } from 'lucide-react'; 
import MultiplayerAuth from './MultiplayerMenuComponent';
import MultiplayerMenu from './MultiplayerLobby';
import { useAuth } from './useAuth';


const DominoGame = () => {
  const [gameState, setGameState] = useState('menu');
  const [playerTokens, setPlayerTokens] = useState(1000);
  const [opponentTokens, setOpponentTokens] = useState(1000);
  const [currentBet, setCurrentBet] = useState(50);
  const [playerHand, setPlayerHand] = useState([]);
  const [opponentHand, setOpponentHand] = useState([]);
  const [board, setBoard] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState('player');
  const [selectedDomino, setSelectedDomino] = useState(null);
  const [winner, setWinner] = useState(null);
  const [message, setMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [passCount, setPassCount] = useState(0);

  const { currentUser, loading } = useAuth();

  const createDominoSet = () => {
    const dominos = [];
    let id = 0;
    for (let i = 0; i <= 6; i++) {
      for (let j = i; j <= 6; j++) {
        dominos.push({ left: i, right: j, id: `d${id++}` });
      }
    }
    return dominos;
  };

  const shuffleAndDeal = () => {
    const allDominos = createDominoSet();
    const shuffled = [...allDominos].sort(() => Math.random() - 0.5);
    return {
      playerDominos: shuffled.slice(0, 7),
      opponentDominos: shuffled.slice(7, 14)
    };
  };

  const startGame = () => {
    if (playerTokens < currentBet) {
      setMessage("Pa gen ase jeton!");
      return;
    }
    const { playerDominos, opponentDominos } = shuffleAndDeal();
    setPlayerHand(playerDominos);
    setOpponentHand(opponentDominos);
    setBoard([]);
    setCurrentPlayer('player');
    setSelectedDomino(null);
    setWinner(null);
    setPassCount(0);
    setMessage("Se tou ou! Chwazi yon domino.");
    setGameState('playing');
  };

  const canPlayOnSide = (domino, side) => {
    if (board.length === 0) return true;
    if (side === 'left') {
      const leftEnd = board[0].left;
      return domino.left === leftEnd || domino.right === leftEnd;
    } else {
      const rightEnd = board[board.length - 1].right;
      return domino.left === rightEnd || domino.right === rightEnd;
    }
  };

  const canPlayAnyDomino = (hand) => {
    if (board.length === 0) return hand.length > 0;
    return hand.some(d => canPlayOnSide(d, 'left') || canPlayOnSide(d, 'right'));
  };

  const placeDomino = (side) => {
    if (!selectedDomino) return;
    if (!canPlayOnSide(selectedDomino, side)) {
      setMessage("Ou pa ka jwe domino sa a la a!");
      setShowError(true);
      setTimeout(() => setShowError(false), 1500);
      return;
    }

    let newDomino = { ...selectedDomino };
    let newBoard = [...board];

    if (board.length === 0) {
      newBoard.push(newDomino);
    } else if (side === 'left') {
      const leftEnd = board[0].left;
      if (newDomino.right === leftEnd) {
        newBoard.unshift(newDomino);
      } else {
        newBoard.unshift({ ...newDomino, left: newDomino.right, right: newDomino.left });
      }
    } else {
      const rightEnd = board[board.length - 1].right;
      if (newDomino.left === rightEnd) {
        newBoard.push(newDomino);
      } else {
        newBoard.push({ ...newDomino, left: newDomino.right, right: newDomino.left });
      }
    }

    const newPlayerHand = playerHand.filter(d => d.id !== selectedDomino.id);
    setPlayerHand(newPlayerHand);
    setBoard(newBoard);
    setSelectedDomino(null);
    setPassCount(0);

    if (newPlayerHand.length === 0) {
      endGame('player', false);
      return;
    }

    setMessage("Tou advèsè a...");
    setCurrentPlayer('opponent');
    setTimeout(() => opponentTurn(newBoard, newPlayerHand), 1500);
  };

  const passTurn = () => {
    if (canPlayAnyDomino(playerHand)) {
      setMessage("Ou gen domino pou jwe! Pa ka pase!");
      setShowError(true);
      setTimeout(() => setShowError(false), 1500);
      return;
    }

    const newPassCount = passCount + 1;
    setPassCount(newPassCount);
    
    if (newPassCount >= 2) {
      setMessage("🔒 Domino a fèmen! Konte pwen...");
      setTimeout(() => endGameByCount(), 1500);
      return;
    }

    setMessage("Ou pase! Tou advèsè a...");
    setSelectedDomino(null);
    setCurrentPlayer('opponent');
    setTimeout(() => opponentTurn(board, playerHand), 1500);
  };

  const opponentTurn = (currentBoard, currentPlayerHand) => {
    const playableDominos = opponentHand.filter(d => {
      if (currentBoard.length === 0) return true;
      const leftEnd = currentBoard[0].left;
      const rightEnd = currentBoard[currentBoard.length - 1].right;
      return d.left === leftEnd || d.right === leftEnd || d.left === rightEnd || d.right === rightEnd;
    });

    if (playableDominos.length === 0) {
      const newPassCount = passCount + 1;
      setPassCount(newPassCount);
      if (newPassCount >= 2) {
        setMessage("🔒 Domino a fèmen! Konte pwen...");
        setTimeout(() => endGameByCount(), 1500);
        return;
      }
      setMessage("Advèsè a pase! Se tou ou!");
      setCurrentPlayer('player');
      return;
    }

    const chosenDomino = playableDominos[Math.floor(Math.random() * playableDominos.length)];
    let newBoard = [...currentBoard];
    let playedDomino = { ...chosenDomino };

    if (currentBoard.length === 0) {
      newBoard.push(playedDomino);
    } else {
      const leftEnd = newBoard[0].left;
      const rightEnd = newBoard[newBoard.length - 1].right;
      const canPlayLeft = playedDomino.left === leftEnd || playedDomino.right === leftEnd;
      const canPlayRight = playedDomino.left === rightEnd || playedDomino.right === rightEnd;

      if (canPlayLeft && canPlayRight) {
        const side = Math.random() > 0.5 ? 'left' : 'right';
        if (side === 'left') {
          if (playedDomino.right === leftEnd) {
            newBoard.unshift(playedDomino);
          } else if (playedDomino.left === leftEnd) {
            newBoard.unshift({ ...playedDomino, left: playedDomino.right, right: playedDomino.left });
          }
        } else {
          if (playedDomino.left === rightEnd) {
            newBoard.push(playedDomino);
          } else if (playedDomino.right === rightEnd) {
            newBoard.push({ ...playedDomino, left: playedDomino.right, right: playedDomino.left });
          }
        }
      } else if (canPlayLeft) {
        if (playedDomino.right === leftEnd) {
          newBoard.unshift(playedDomino);
        } else if (playedDomino.left === leftEnd) {
          newBoard.unshift({ ...playedDomino, left: playedDomino.right, right: playedDomino.left });
        }
      } else if (canPlayRight) {
        if (playedDomino.left === rightEnd) {
          newBoard.push(playedDomino);
        } else if (playedDomino.right === rightEnd) {
          newBoard.push({ ...playedDomino, left: playedDomino.right, right: playedDomino.left });
        }
      }
    }

    const newOpponentHand = opponentHand.filter(d => d.id !== chosenDomino.id);
    setOpponentHand(newOpponentHand);
    setBoard(newBoard);
    setPassCount(0);

    if (newOpponentHand.length === 0) {
      endGame('opponent', false);
      return;
    }

    setMessage("Se tou pa ou!");
    setCurrentPlayer('player');
  };

  const endGameByCount = () => {
    const playerPoints = playerHand.reduce((sum, d) => sum + d.left + d.right, 0);
    const opponentPoints = opponentHand.reduce((sum, d) => sum + d.left + d.right, 0);

    if (playerPoints < opponentPoints) {
      endGame('player', false, `🔒 Domino a fèmen! Ou genyen pa konte! (${playerPoints} vs ${opponentPoints})`);
    } else if (opponentPoints < playerPoints) {
      endGame('opponent', false, `🔒 Domino a fèmen! Advèsè a genyen pa konte! (${opponentPoints} vs ${playerPoints})`);
    } else {
      endGame('draw', false, `🔒 Domino a fèmen! Egalite! (${playerPoints} vs ${opponentPoints})`);
    }
  };

  const endGame = (winnerName, isDjapotWin = false, customMessage = null) => {
    setWinner(winnerName);
    setGameState('result');

    if (winnerName === 'player') {
      setPlayerTokens(prev => prev + currentBet);
      setOpponentTokens(prev => prev - currentBet);
      setMessage(customMessage || `🎉 OU GENYEN! +${currentBet} jeton!`);
    } else if (winnerName === 'opponent') {
      setPlayerTokens(prev => prev - currentBet);
      setOpponentTokens(prev => prev + currentBet);
      setMessage(customMessage || `😞 OU PÈDI! -${currentBet} jeton!`);
    } else {
      setMessage(customMessage || "Egalite!");
    }
  };

  const DominoPointsSmall = ({ value, size = '3px' }) => {
    const positions = {
      0: [], 1: [[50, 50]], 2: [[25, 25], [75, 75]], 3: [[25, 25], [50, 50], [75, 75]],
      4: [[25, 25], [25, 75], [75, 25], [75, 75]], 5: [[25, 25], [25, 75], [50, 50], [75, 25], [75, 75]],
      6: [[25, 25], [25, 75], [50, 25], [50, 75], [75, 25], [75, 75]]
    };

    return (
      <div className="relative w-full h-full">
        {positions[value].map(([top, left], idx) => (
          <div key={idx} className="absolute bg-black rounded-full"
            style={{ width: size, height: size, left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -50%)' }}
          />
        ))}
      </div>
    );
  };

  const DominoPoints = ({ value }) => {
    const positions = {
      0: [], 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]],
      4: [[0, 0], [0, 2], [2, 0], [2, 2]], 5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
      6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]]
    };

    return (
      <div className="relative w-full h-full">
        {positions[value].map(([row, col], idx) => (
          <div key={idx} className="absolute bg-black rounded-full"
            style={{ width: '6px', height: '6px', left: `${col * 33 + 20}%`, top: `${row * 33 + 20}%` }}
          />
        ))}
      </div>
    );
  };

  const DominoTile = ({ domino, onClick, selected, disabled }) => (
    <div onClick={disabled ? null : onClick}
      className={`inline-flex flex-col bg-gradient-to-b from-amber-50 to-amber-100 rounded-lg shadow-lg border-2 border-amber-800 cursor-pointer transition-all
        ${selected ? 'ring-2 ring-yellow-400 transform -translate-y-2 scale-105' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:transform hover:-translate-y-1'}
      `}
      style={{ width: '50px', height: '100px', margin: '4px' }}
    >
      <div className="flex-1 flex items-center justify-center border-b-2 border-amber-900 relative">
        <DominoPoints value={domino.left} />
      </div>
      <div className="flex-1 flex items-center justify-center relative">
        <DominoPoints value={domino.right} />
      </div>
    </div>
  );

  const DominoTileHorizontal = ({ domino, reversed = false, vertical = false }) => {
    const isDouble = domino.left === domino.right;
    const leftValue = reversed ? domino.right : domino.left;
    const rightValue = reversed ? domino.left : domino.right;
    
    if (isDouble || vertical) {
      return (
        <div className="inline-flex flex-col bg-gradient-to-b from-amber-50 to-amber-100 rounded shadow-sm border border-amber-800"
          style={{ width: '24px', height: '48px', margin: '1px' }}>
          <div className="flex-1 flex items-center justify-center border-b border-amber-900">
            <DominoPointsSmall value={leftValue} size="2.5px" />
          </div>
          <div className="flex-1 flex items-center justify-center">
            <DominoPointsSmall value={rightValue} size="2.5px" />
          </div>
        </div>
      );
    }

    return (
      <div className="inline-flex flex-row bg-gradient-to-r from-amber-50 to-amber-100 rounded shadow-sm border border-amber-800"
        style={{ width: '48px', height: '24px', margin: '1px' }}>
        <div className="flex-1 flex items-center justify-center border-r border-amber-900">
          <DominoPointsSmall value={leftValue} size="2.5px" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <DominoPointsSmall value={rightValue} size="2.5px" />
        </div>
      </div>
    );
  };



// Ecran de chargement

  if (loading) {
    return (
      <div className="min-h-screen bg-green-900 flex items-center justify-center">
        <p className="text-white text-xl">Chajman...</p>
      </div>
    );
  }



  if (gameState === 'multiplayer-menu') {
    if (!currentUser) {
      return <MultiplayerAuth onBack={() => setGameState('menu')} />;
    }
    return <MultiplayerMenu onBack={() => setGameState('menu')} playerTokens={playerTokens} />;
  }

  if (gameState === 'menu') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-700 to-emerald-900 flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-5 sm:p-8 w-full max-w-sm">
          <div className="text-center mb-6 sm:mb-8">
            <Sparkles className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-yellow-500" />
            <h1 className="text-2xl sm:text-4xl font-bold text-gray-800 mb-1 sm:mb-2">Domino Ayiti</h1>
            <p className="text-sm sm:text-base text-gray-600">Jwe pou'w genyen!</p>
          </div>

          <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-xl p-4 sm:p-6 mb-5 sm:mb-6">
            <div className="flex items-center justify-center mb-1 sm:mb-2">
              <Coins className="w-6 h-6 sm:w-8 sm:h-8 text-white mr-2" />
              <span className="text-2xl sm:text-3xl font-bold text-white">{playerTokens}</span>
            </div>
            <p className="text-center text-white text-xs sm:text-sm">Jeton ou yo</p>
          </div>

          <button onClick={() => setGameState('betting')}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 sm:py-4 rounded-xl transition-colors mb-3 sm:mb-4 text-sm sm:text-base">
            <Users className="inline-block mr-2 w-5 h-5" />
            Jwe 1v1 (AI)
          </button>

          <button
            onClick={() => setGameState('multiplayer-menu')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 sm:py-4 rounded-xl transition-colors mb-3 sm:mb-4 text-sm sm:text-base"
          >
            <Users className="inline-block mr-2 w-5 h-5" />
            Jwe 1v1 (Reyèl)
          </button>

          <div className="text-center text-xs sm:text-sm text-gray-500 mt-3 sm:mt-4">
            <p>Vèsyon beta - Devlope pa James Richardson Boursiquot</p>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'betting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-700 to-emerald-900 flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-5 sm:p-8 w-full max-w-sm">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-5 sm:mb-6 text-gray-800">Mete lajan ou</h2>

          <div className="bg-gray-100 rounded-xl p-3 sm:p-4 mb-5 sm:mb-6">
            <p className="text-center text-sm text-gray-600 mb-1 sm:mb-2">Jeton ou yo</p>
            <p className="text-center text-3xl sm:text-4xl font-bold text-green-600">{playerTokens}</p>
          </div>

          <div className="mb-5 sm:mb-6">
            <label className="block text-sm sm:text-base text-gray-700 font-bold mb-2">Konbyen ou vle mize?</label>
            <input type="range" min="10" max={playerTokens} step="10" value={currentBet}
              onChange={(e) => setCurrentBet(parseInt(e.target.value))} className="w-full" />
            <div className="text-center mt-2">
              <span className="text-2xl sm:text-3xl font-bold text-yellow-600">{currentBet}</span>
              <span className="text-sm sm:text-base text-gray-600 ml-2">jeton</span>
            </div>
          </div>

          <button onClick={startGame} disabled={playerTokens < currentBet}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 sm:py-4 rounded-xl transition-colors mb-2 sm:mb-3 text-sm sm:text-base">
            Kòmanse pati a
          </button>

          <button onClick={() => setGameState('menu')}
            className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 sm:py-3 rounded-xl transition-colors text-sm sm:text-base">
            Tounen
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'playing') {
    const canPlayLeft = selectedDomino && canPlayOnSide(selectedDomino, 'left');
    const canPlayRight = selectedDomino && canPlayOnSide(selectedDomino, 'right');

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-700 to-emerald-900 p-2 sm:p-3 md:p-4">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-lg shadow p-2 sm:p-3 mb-2 flex justify-between items-center text-xs sm:text-sm">
            <div>
              <p className="text-gray-600">Advèsè</p>
              <p className="font-bold text-sm sm:text-base">{opponentHand.length} domino</p>
            </div>
            <div className="text-center">
              <p className="text-gray-600">Mise</p>
              <p className="font-bold text-base sm:text-xl text-yellow-600">{currentBet}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-600">Jeton</p>
              <p className="font-bold text-sm sm:text-base text-green-600">{playerTokens}</p>
            </div>
          </div>

          <div className={`border-l-4 p-2 sm:p-3 mb-2 rounded text-xs sm:text-sm ${showError ? 'bg-red-100 border-red-500' : 'bg-blue-100 border-blue-500'}`}>
            <p className={`font-bold ${showError ? 'text-red-800' : 'text-blue-800'}`}>{message}</p>
          </div>

          <div className="bg-gradient-to-br from-green-800 to-green-900 rounded-lg shadow-xl p-2 sm:p-4 mb-2 overflow-x-auto" style={{ minHeight: '180px' }}>
            <h3 className="text-white font-bold mb-2 text-center text-xs sm:text-sm">Tab la</h3>

            {board.length === 0 ? (
              <div className="flex items-center justify-center" style={{ minHeight: '140px' }}>
                <div onClick={() => selectedDomino && placeDomino('right')}
                  className={`text-white text-center p-3 sm:p-6 border-2 border-dashed rounded-lg text-xs sm:text-sm
                    ${selectedDomino ? 'border-yellow-400 bg-yellow-400/20 cursor-pointer' : 'border-white/30'}
                  `}>
                  <p>Klike pou jwe</p>
                </div>
              </div>
            ) : (
              <div className="relative">
                {selectedDomino && (
                  <div className="flex justify-between mb-2">
                    <div onClick={() => placeDomino('left')}
                      className={`w-10 h-8 sm:w-12 sm:h-10 border border-dashed rounded flex items-center justify-center cursor-pointer
                        ${canPlayLeft ? 'border-yellow-400 bg-yellow-400/30' : 'border-red-400 bg-red-400/20'}
                      `}>
                      <span className="text-white text-sm sm:text-base font-bold">←</span>
                    </div>
                    <div onClick={() => placeDomino('right')}
                      className={`w-10 h-8 sm:w-12 sm:h-10 border border-dashed rounded flex items-center justify-center cursor-pointer
                        ${canPlayRight ? 'border-yellow-400 bg-yellow-400/30' : 'border-red-400 bg-red-400/20'}
                      `}>
                      <span className="text-white text-sm sm:text-base font-bold">→</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto pb-2">
                  {board.map((domino, idx) => {
                    const isDouble = domino.left === domino.right;
                    
                    return (
                      <DominoTileHorizontal 
                        key={`${domino.id}-${idx}`} 
                        domino={domino} 
                        reversed={false}
                        vertical={isDouble}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>



          <div className="bg-white rounded-lg shadow p-2 sm:p-4">
            <h3 className="font-bold mb-2 text-center text-sm sm:text-base">Men ou ({playerHand.length})</h3>
            <div className="flex flex-wrap justify-center">
              {playerHand.map((domino) => (
                <DominoTile key={domino.id} domino={domino}
                  selected={selectedDomino?.id === domino.id}
                  onClick={() => setSelectedDomino(domino)}
                  disabled={currentPlayer !== 'player'}
                />
              ))}
            </div>

            {currentPlayer === 'player' && (
              <div className="mt-3 text-center">
                <button onClick={passTurn}
                  className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 sm:px-6 rounded-lg text-xs sm:text-sm">
                  Pase
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'result') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-700 to-emerald-900 flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-5 sm:p-8 w-full max-w-sm text-center">
          <Trophy className="w-14 h-14 sm:w-20 sm:h-20 mx-auto mb-3 sm:mb-4 text-yellow-500" />
          <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 text-gray-800">
            {winner === 'player' ? 'Ou Genyen!' : winner === 'opponent' ? 'Ou Pèdi!' : 'Egalite!'}
          </h2>
          <p className="text-sm sm:text-lg mb-4 sm:mb-6 text-gray-700">{message}</p>

          <div className="bg-gray-100 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
            <p className="text-xs sm:text-sm text-gray-600 mb-1">Jeton ou kounye a</p>
            <p className="text-3xl sm:text-4xl font-bold text-green-600">{playerTokens}</p>
          </div>

          <button onClick={() => setGameState('menu')}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 sm:py-4 rounded-xl text-sm sm:text-base">
            Tounen nan meni
          </button>
        </div>
      </div>
    );
  }
};

export default DominoGame;