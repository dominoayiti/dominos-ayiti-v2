import React, { useState, useEffect } from 'react';
import { Coins, X, Loader, AlertCircle } from 'lucide-react';
import { database } from '../firebase-config';
import { ref, set, onValue, remove } from 'firebase/database';

const BettingModal = ({ currentUser, userData, opponent, onClose, onStartGame }) => {
  const [myBet, setMyBet] = useState(null);
  const [opponentBet, setOpponentBet] = useState(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState('');
  const [gameSession, setGameSession] = useState(null);

  // Générer un ID de session unique
  useEffect(() => {
    const sessionId = `game_${Date.now()}_${currentUser.uid}_${opponent.uid}`;
    setGameSession(sessionId);
  }, [currentUser.uid, opponent.uid]);

  // Écouter les mises de l'adversaire
  useEffect(() => {
    if (!gameSession || !opponent) return;

    const betRef = ref(database, `gameBets/${gameSession}/${opponent.uid}`);
    
    const unsubscribe = onValue(betRef, (snapshot) => {
      const data = snapshot.val();
      
      if (data) {
        console.log('💰 Mise adversaire détectée:', data.amount);
        setOpponentBet(data.amount);
      } else {
        setOpponentBet(null);
      }
    });

    return () => unsubscribe();
  }, [gameSession, opponent]);

  // Vérifier si les deux joueurs ont misé
  useEffect(() => {
    if (myBet && opponentBet && myBet === opponentBet) {
      console.log('✅ Les deux joueurs ont misé le même montant:', myBet);
      
      // Attendre 1 seconde puis lancer le jeu
      setTimeout(() => {
        const gameData = {
          sessionId: gameSession,
          player1Uid: currentUser.uid,
          player1Pseudo: userData.pseudo,
          player2Uid: opponent.uid,
          player2Pseudo: opponent.pseudo,
          bet: myBet,
          timestamp: Date.now()
        };
        
        onStartGame(gameData);
      }, 1000);
    }
  }, [myBet, opponentBet, gameSession, currentUser, userData, opponent, onStartGame]);

  const betOptions = [10, 50, 100, 500, 1000, 5000];

  const handlePlaceBet = async (amount) => {
    // Vérifier si l'adversaire a déjà misé
    if (opponentBet && amount !== opponentBet) {
      setError(`Ou dwe mize ${opponentBet} jetons tankou advèsè ou!`);
      return;
    }

    // Vérifier si le joueur a assez de jetons
    if (amount > (userData?.tokens || 0)) {
      setError('Ou pa gen ase jeton!');
      return;
    }

    setError('');
    setMyBet(amount);
    setIsWaiting(true);

    try {
      // Enregistrer la mise dans Firebase
      const betRef = ref(database, `gameBets/${gameSession}/${currentUser.uid}`);
      await set(betRef, {
        amount: amount,
        pseudo: userData.pseudo,
        timestamp: Date.now()
      });

      console.log('✅ Mise enregistrée:', amount);
    } catch (error) {
      console.error('❌ Erreur placement mise:', error);
      setError('Erè! Pa ka anrejistre mize a.');
      setIsWaiting(false);
    }
  };

  const handleCancel = async () => {
    // Supprimer la mise de Firebase
    if (gameSession && myBet) {
      try {
        await remove(ref(database, `gameBets/${gameSession}/${currentUser.uid}`));
      } catch (error) {
        console.error('❌ Erreur annulation:', error);
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 p-6 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Coins className="w-8 h-8 text-white" />
              <div>
                <h2 className="text-2xl font-bold text-white">Mize Jeton</h2>
                <p className="text-yellow-100 text-sm">Chwazi kantite jeton pou mize</p>
              </div>
            </div>
            <button 
              onClick={handleCancel}
              disabled={isWaiting}
              className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Affichage des jetons actuels */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-gray-700 font-semibold">Jeton ou:</span>
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-yellow-600" />
                <span className="text-2xl font-bold text-green-700">{userData?.tokens || 0}</span>
              </div>
            </div>
          </div>

          {/* Affichage adversaire */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Advèsè:</p>
                <p className="font-bold text-gray-800">{opponent.pseudo}</p>
              </div>
              {opponentBet ? (
                <div className="flex items-center gap-2 bg-green-500 text-white px-3 py-2 rounded-lg">
                  <Coins className="w-4 h-4" />
                  <span className="font-bold">{opponentBet}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Tann mise...</span>
                </div>
              )}
            </div>
          </div>

          {/* Message d'erreur */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 mb-4 rounded">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <p className="text-sm text-red-700 font-semibold">{error}</p>
              </div>
            </div>
          )}

          {/* Options de mise */}
          {!myBet ? (
            <>
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                {opponentBet ? `Mize ${opponentBet} jetons pou matche` : 'Chwazi mize ou'}
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {betOptions.map((amount) => {
                  const canAfford = amount <= (userData?.tokens || 0);
                  const mustMatch = opponentBet && amount !== opponentBet;
                  const isDisabled = !canAfford || mustMatch;

                  return (
                    <button
                      key={amount}
                      onClick={() => handlePlaceBet(amount)}
                      disabled={isDisabled}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        isDisabled
                          ? 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                          : opponentBet && amount === opponentBet
                          ? 'border-green-600 bg-green-50 hover:bg-green-100 shadow-lg animate-pulse'
                          : 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-center justify-center mb-2">
                        <Coins className={`w-6 h-6 ${
                          isDisabled ? 'text-gray-400' : 'text-yellow-600'
                        }`} />
                      </div>
                      <p className={`font-bold text-lg ${
                        isDisabled ? 'text-gray-400' : 'text-gray-800'
                      }`}>
                        {amount}
                      </p>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Loader className="w-10 h-10 text-green-600 animate-spin" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Mize Anrejistre!</h3>
              <p className="text-gray-600 mb-1">Ou mize: <span className="font-bold text-green-600">{myBet} jetons</span></p>
              <p className="text-sm text-gray-500">
                {opponentBet 
                  ? 'Preparasyon jwèt...' 
                  : `Tann ${opponent.pseudo} mize...`}
              </p>
            </div>
          )}

          {!myBet && (
            <button
              onClick={handleCancel}
              className="w-full mt-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl transition-colors"
            >
              Anile
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BettingModal;