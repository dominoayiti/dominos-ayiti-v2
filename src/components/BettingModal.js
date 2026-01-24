import React, { useState, useEffect } from 'react';
import { Coins, X, AlertCircle } from 'lucide-react';
import { database } from '../firebase-config';
import { ref, set, onValue, remove } from 'firebase/database';

const BettingModal = ({ 
  currentUser, 
  userData, 
  opponent, 
  onClose, 
  onStartGame 
}) => {
  const [myBet, setMyBet] = useState(50);
  const [opponentBet, setOpponentBet] = useState(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const maxBet = Math.min(userData?.tokens || 0, opponent?.tokens || 0);
  const minBet = 50;

  // Écouter la mise de l'adversaire
  useEffect(() => {
    if (!currentUser || !opponent) return;

    const gameId = [currentUser.uid, opponent.uid].sort().join('_');
    const bettingRef = ref(database, `gameBetting/${gameId}/${opponent.uid}`);

    const unsubscribe = onValue(bettingRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setOpponentBet(data.bet);
      }
    });

    return () => unsubscribe();
  }, [currentUser, opponent]);

  const submitBet = async () => {
    if (myBet < minBet) {
      setErrorMessage(`Minimum: ${minBet} jetons`);
      return;
    }

    if (myBet > (userData?.tokens || 0)) {
      setErrorMessage('Pa gen ase jeton!');
      return;
    }

    try {
      const gameId = [currentUser.uid, opponent.uid].sort().join('_');
      
      // Sauvegarder ma mise
      await set(ref(database, `gameBetting/${gameId}/${currentUser.uid}`), {
        bet: myBet,
        pseudo: userData?.pseudo,
        timestamp: Date.now()
      });

      setIsWaiting(true);
      setErrorMessage('');

      // Vérifier si les deux ont misé le même montant
      if (opponentBet && opponentBet === myBet) {
        // Les deux ont misé pareil, on peut lancer le jeu
        await startGame(gameId, myBet);
      }
    } catch (error) {
      console.error('❌ Erreur mise:', error);
      setErrorMessage('Erè! Eseye ankò.');
    }
  };

  const startGame = async (gameId, bet) => {
    try {
      // Créer la partie
      await set(ref(database, `activeGames/${gameId}`), {
        player1: currentUser.uid,
        player1Pseudo: userData?.pseudo,
        player2: opponent.uid,
        player2Pseudo: opponent.pseudo,
        bet: bet,
        status: 'playing',
        createdAt: Date.now()
      });

      // Nettoyer les mises
      await remove(ref(database, `gameBetting/${gameId}`));

      // Lancer le jeu
      if (onStartGame) {
        onStartGame({
          gameId,
          opponent,
          bet
        });
      }
    } catch (error) {
      console.error('❌ Erreur lancement jeu:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Mete Lajan</h2>
              <p className="text-white/90 text-sm">Kont: {opponent?.pseudo}</p>
            </div>
            <button 
              onClick={onClose}
              className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Solde actuel */}
          <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-center">
              <Coins className="w-6 h-6 text-white mr-2" />
              <span className="text-white font-bold text-2xl">{userData?.tokens || 0}</span>
            </div>
            <p className="text-center text-white/90 text-sm mt-1">Jeton ou yo</p>
          </div>

          {/* Message d'erreur */}
          {errorMessage && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4 rounded">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                <p className="text-sm text-red-800">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Mise de l'adversaire */}
          {opponentBet && (
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4 rounded">
              <p className="text-sm text-blue-800">
                <span className="font-bold">{opponent?.pseudo}</span> mize:{' '}
                <span className="font-bold">{opponentBet} jetons</span>
              </p>
            </div>
          )}

          {/* Slider de mise */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Konbyen ou vle mize?
            </label>
            <input
              type="range"
              min={minBet}
              max={maxBet}
              step="10"
              value={myBet}
              onChange={(e) => setMyBet(parseInt(e.target.value))}
              disabled={isWaiting}
              className="w-full"
            />
            <div className="text-center mt-2">
              <span className="text-3xl font-bold text-green-600">{myBet}</span>
              <span className="text-gray-600 ml-2">jetons</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Min: {minBet}</span>
              <span>Max: {maxBet}</span>
            </div>
          </div>

          {/* Avertissement égalité */}
          {opponentBet && opponentBet !== myBet && (
            <div className="bg-orange-50 border-l-4 border-orange-400 p-4 mb-4 rounded">
              <p className="text-sm text-orange-800">
                ⚠️ Ou dwe mize <span className="font-bold">{opponentBet} jetons</span> tankou {opponent?.pseudo}
              </p>
            </div>
          )}

          {/* Bouton valider */}
          <button
            onClick={submitBet}
            disabled={isWaiting || myBet > maxBet}
            className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isWaiting ? 'Ap tann advèsè a...' : 'Konfime Mise'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BettingModal;