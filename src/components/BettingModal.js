import React, { useState, useEffect, useCallback } from 'react';
import { Coins, X, Loader, AlertCircle } from 'lucide-react';
import { database } from '../firebase-config';
import { ref, set, onValue, remove } from 'firebase/database';

const BettingModal = ({ currentUser, userData, opponent, isRequester, onClose, onStartGame }) => { 
  const [myBet, setMyBet] = useState(null);
  const [opponentBet, setOpponentBet] = useState(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState('');
  const [gameSession, setGameSession] = useState(null);
  const [isCancelled, setIsCancelled] = useState(false);

  // Générer un ID de session UNIFIÉ pour les deux joueurs
  useEffect(() => {
    const uids = [currentUser.uid, opponent.uid].sort();
    const sessionId = `game_${uids[0]}_${uids[1]}`;
    setGameSession(sessionId);
    console.log('🎮 Session ID créé:', sessionId);
  }, [currentUser.uid, opponent.uid]);

  // ✅ NETTOYAGE DE LA SESSION AU DÉMARRAGE
  useEffect(() => {
    const cleanupSession = async () => {
      if (!gameSession) return;
      
      console.log('🧹 Nettoyage initial de la session:', gameSession);
      
      try {
        // Nettoyer les flags d'erreur
        await remove(ref(database, `gameBets/${gameSession}/cancelled`));
        await remove(ref(database, `gameBets/${gameSession}/error`));
        await remove(ref(database, `gameBets/${gameSession}/insufficient_funds`));
        
        // ✅ CRITIQUE : SUPPRESSION DE LA LIGNE DANGEREUSE
        // On ne supprime PAS la mise au démarrage pour éviter de supprimer une mise active
        // en cas de re-render du composant.
        
        console.log('✅ Session nettoyée au démarrage du modal');
      } catch (error) {
        console.error('❌ Erreur nettoyage session:', error);
      }
    };

    cleanupSession();
  }, [gameSession, currentUser.uid]);

  // ✅ CORRECTION: Déplacer handleCancel avant les useEffect qui l'utilisent
  const handleCancel = useCallback(async () => {
    if (isCancelled) return;

    try {
      const cancelRef = ref(database, `gameBets/${gameSession}/cancelled`);
      await set(cancelRef, {
        by: currentUser.uid,
        byPseudo: userData.pseudo,
        timestamp: Date.now()
      });

      if (myBet) {
        await remove(ref(database, `gameBets/${gameSession}/${currentUser.uid}`));
      }

      const toastDiv = document.createElement('div');
      toastDiv.className = 'fixed top-4 right-4 bg-orange-500 text-white px-6 py-3 rounded-lg shadow-lg z-[9999] animate-slide-in';
      toastDiv.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-xl">⚠️</span>
          <span class="font-semibold">Ou anile match la</span>
        </div>
      `;
      document.body.appendChild(toastDiv);
      setTimeout(() => toastDiv.remove(), 2000);

      setTimeout(async () => {
        await remove(ref(database, `gameBets/${gameSession}`));
      }, 3000);

    } catch (error) {
      console.error('❌ Erreur annulation:', error);
    }

    onClose();
  }, [isCancelled, gameSession, currentUser.uid, userData.pseudo, myBet, onClose]);

  // ✅ CORRECTION MAJEURE: Écouter toute la session
  useEffect(() => {
    if (!gameSession || !opponent) return;

    console.log('👂 Écoute mise pour session:', gameSession, 'Cible:', opponent.pseudo);

    const betsRef = ref(database, `gameBets/${gameSession}`);
    
    const unsubscribe = onValue(betsRef, (snapshot) => {
      const data = snapshot.val();
      
      if (data) {
        const opponentBetData = data[opponent.uid];
        
        if (opponentBetData) {
          console.log('💰 Mise adversaire détectée (méthode robuste):', opponentBetData.amount);
          setOpponentBet(opponentBetData.amount);
        } else {
          console.log('⏳ Aucune mise adversaire (session trouvée mais mise vide)');
          if (data[opponent.uid] === null && opponentBet !== null) {
             setOpponentBet(null);
          }
        }
      } else {
        console.log('⏳ Session de mise vide');
        setOpponentBet(null);
      }
    });

    return () => unsubscribe();
  }, [gameSession, opponent, opponentBet]);

  // Écouter les annulations
  useEffect(() => {
    if (!gameSession) return;

    const cancelRef = ref(database, `gameBets/${gameSession}/cancelled`);
    
    const unsubscribe = onValue(cancelRef, (snapshot) => {
      const data = snapshot.val();
      
      if (data && data.by !== currentUser.uid) {
        console.log('❌ Match annulé par:', data.byPseudo);
        
        const toastDiv = document.createElement('div');
        toastDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-[9999] animate-slide-in';
        toastDiv.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="text-xl">❌</span>
            <span class="font-semibold">${data.byPseudo} anile match la</span>
          </div>
        `;
        document.body.appendChild(toastDiv);
        setTimeout(() => {
          toastDiv.remove();
          onClose();
        }, 3000);
        
        setIsCancelled(true);
      }
    });

    return () => unsubscribe();
  }, [gameSession, currentUser.uid, onClose]);

  // Écouter les erreurs de fonds insuffisants
  useEffect(() => {
    if (!gameSession) return;

    const insufficientRef = ref(database, `gameBets/${gameSession}/insufficient_funds`);
    
    const unsubscribe = onValue(insufficientRef, (snapshot) => {
      const data = snapshot.val();
      
      if (data && data.targetUid === currentUser.uid) {
        const toastDiv = document.createElement('div');
        toastDiv.className = 'fixed top-4 right-4 bg-orange-500 text-white px-6 py-3 rounded-lg shadow-lg z-[9999] animate-slide-in';
        toastDiv.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="text-xl">⚠️</span>
            <div>
              <p class="font-semibold">${data.byPseudo} te mande ${data.requestedAmount} jetons</p>
              <p class="text-sm">Men ou gen sèlman ${data.opponentTokens} jetons</p>
            </div>
          </div>
        `;
        document.body.appendChild(toastDiv);
        setTimeout(() => {
          toastDiv.remove();
          onClose();
        }, 4000);
      }
    });

    return () => unsubscribe();
  }, [gameSession, currentUser.uid, onClose]);

  // Vérification finale
  useEffect(() => {
    if (myBet && opponentBet && myBet === opponentBet) {
      console.log('✅ Les deux joueurs ont misé le même montant:', myBet);
      
      const currentPlayerHasEnough = myBet <= (userData?.tokens || 0);
      const opponentHasEnough = opponentBet <= (opponent?.tokens || 0);
      
      if (!currentPlayerHasEnough || !opponentHasEnough) {
        console.error('❌ Fonds insuffisants détectés après mise!');
        
        const toastDiv = document.createElement('div');
        toastDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-[9999] animate-slide-in';
        toastDiv.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="text-xl">❌</span>
            <span class="font-semibold">Erè! Match enposib - Jeton ensifisan</span>
          </div>
        `;
        document.body.appendChild(toastDiv);
        setTimeout(() => {
          toastDiv.remove();
          handleCancel();
        }, 3000);
        
        return;
      }
      
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
  }, [myBet, opponentBet, gameSession, currentUser, userData, opponent, onStartGame, handleCancel]);

  const betOptions = [10, 50, 100, 500, 1000, 5000];

  const handlePlaceBet = async (amount) => {
    console.log('🔍 CLIC SUR MISE:', amount, 'Est-ce que je suis l\'hôte (Requester)?', isRequester);
    console.log('🔍 Adversaire:', opponent.pseudo, 'UID:', opponent.uid);

    // ✅ BLOQUER L'INVITÉ SI L'HÔTE N'A PAS ENCORE MISÉ
    if (!isRequester && !opponentBet) {
      setError(`Tan pou ${opponent.pseudo} chwazi mize la anvan!`);
      const toastDiv = document.createElement('div');
      toastDiv.className = 'fixed top-4 right-4 bg-orange-500 text-white px-6 py-3 rounded-lg shadow-lg z-[9999] animate-slide-in';
      toastDiv.innerHTML = `<p class="font-semibold">⏳ Tan pou ${opponent.pseudo} mize...</p>`;
      document.body.appendChild(toastDiv);
      setTimeout(() => toastDiv.remove(), 2000);
      return;
    }

    if (opponentBet && amount !== opponentBet) {
      setError(`Ou dwe mize ${opponentBet} jetons tankou advèsè ou!`);
      return;
    }

    if (amount > (userData?.tokens || 0)) {
      setError('Ou pa gen ase jeton!');
      
      const notifRef = ref(database, `gameBets/${gameSession}/error`);
      await set(notifRef, {
        by: currentUser.uid,
        byPseudo: userData.pseudo,
        message: 'pa gen ase jeton',
        timestamp: Date.now()
      });

      const toastDiv = document.createElement('div');
      toastDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-[9999] animate-slide-in';
      toastDiv.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-xl">❌</span>
          <span class="font-semibold">Ou pa gen ase jeton. Match enposib!</span>
        </div>
      `;
      document.body.appendChild(toastDiv);
      setTimeout(() => {
        toastDiv.remove();
        handleCancel();
      }, 3000);
      
      return;
    }

    setError('');
    setMyBet(amount);
    setIsWaiting(true);

    try {
      console.log('📝 Enregistrement mise:', {
        session: gameSession,
        uid: currentUser.uid,
        amount: amount
      });

      const betRef = ref(database, `gameBets/${gameSession}/${currentUser.uid}`);
      await set(betRef, {
        amount: amount,
        pseudo: userData.pseudo,
        timestamp: Date.now()
      });

      console.log('✅ Mise enregistrée avec succès');
    } catch (error) {
      console.error('❌ Erreur placement mise:', error);
      setError('Erè! Pa ka anrejistre mize a.');
      setIsWaiting(false);
      setMyBet(null);
    }
  };

  if (isCancelled) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[95vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 p-4 rounded-t-2xl sticky top-0 z-10">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Coins className="w-6 h-6 text-white" />
              <div>
                <h2 className="text-xl font-bold text-white">Mize Jeton</h2>
                <p className="text-yellow-100 text-xs">Chwazi kantite jeton</p>
              </div>
            </div>
            <button 
              onClick={handleCancel}
              disabled={isWaiting && myBet && opponentBet}
              className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 flex-shrink-0"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-700 font-semibold text-sm">Jeton ou:</span>
              <div className="flex items-center gap-1">
                <Coins className="w-4 h-4 text-yellow-600" />
                <span className="text-xl font-bold text-green-700">{userData?.tokens || 0}</span>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-600">Advèsè:</p>
                <p className="font-bold text-gray-800 truncate">{opponent.pseudo}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Coins className="w-3 h-3 text-yellow-600" />
                  <span className="text-xs text-gray-600">{opponent.tokens || 0} jetons</span>
                </div>
              </div>
              {opponentBet ? (
                <div className="flex items-center gap-1.5 bg-green-500 text-white px-2.5 py-1.5 rounded-lg flex-shrink-0">
                  <Coins className="w-3.5 h-3.5" />
                  <span className="font-bold text-sm">{opponentBet}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-gray-500 flex-shrink-0">
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                  <span className="text-xs">Tann...</span>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-2 rounded">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 font-semibold">{error}</p>
              </div>
            </div>
          )}

          {!myBet ? (
            <>
              <h3 className="text-base font-bold text-gray-800 pt-1">
                {opponentBet ? `Mize ${opponentBet} jetons` : 'Chwazi mize ou'}
              </h3>
              
              {opponentBet ? (
                <div className="bg-green-50 border-l-4 border-green-400 p-2 rounded animate-pulse">
                  <p className="text-xs text-green-700 font-bold">
                    ✅ {opponent.pseudo} mize {opponentBet}. Klike {opponentBet}!
                  </p>
                </div>
              ) : (
                <div className="bg-blue-50 border-l-4 border-blue-400 p-2 rounded">
                  <p className="text-xs text-blue-700">
                    ⏳ Tann {opponent.pseudo}...
                  </p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-2 pt-1">
                {betOptions.map((amount) => {
                  const canAfford = amount <= (userData?.tokens || 0);
                  
                  let isDisabled = false;
                  let disabledReason = '';
                  let shouldHighlight = false;
                  
                  if (!canAfford) {
                    isDisabled = true;
                    disabledReason = 'Pa gen ase';
                  } else if (opponentBet) {
                    if (amount === opponentBet) {
                      isDisabled = false;
                      shouldHighlight = true;
                      disabledReason = '';
                    } else {
                      isDisabled = true;
                      disabledReason = `Dwe ${opponentBet}`;
                    }
                  }

                  return (
                    <button
                      key={amount}
                      onClick={() => handlePlaceBet(amount)}
                      disabled={isDisabled}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        isDisabled
                          ? 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                          : shouldHighlight
                          ? 'border-green-600 bg-green-50 hover:bg-green-100 shadow-lg animate-pulse ring-2 ring-green-300'
                          : 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100 hover:shadow-md cursor-pointer'
                      }`}
                      title={disabledReason || (shouldHighlight ? 'Klike pou matche!' : 'Klike pou mize')}
                    >
                      <div className="flex items-center justify-center mb-1">
                        <Coins className={`w-5 h-5 ${
                          isDisabled ? 'text-gray-400' : shouldHighlight ? 'text-green-600' : 'text-yellow-600'
                        }`} />
                      </div>
                      <p className={`font-bold ${
                        isDisabled ? 'text-gray-400' : shouldHighlight ? 'text-green-700' : 'text-gray-800'
                      }`}>
                        {amount}
                      </p>
                      {shouldHighlight && (
                        <p className="text-[10px] text-green-600 font-bold mt-0.5">KLIKE!</p>
                      )}
                      {disabledReason && !shouldHighlight && (
                        <p className="text-[9px] text-red-500 mt-0.5 leading-tight">{disabledReason}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                <Loader className="w-8 h-8 text-green-600 animate-spin" />
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-1">Mize Anrejistre!</h3>
              <p className="text-sm text-gray-600">Ou mize: <span className="font-bold text-green-600">{myBet} jetons</span></p>
              <p className="text-xs text-gray-500 mt-1">
                {opponentBet 
                  ? 'Preparasyon jwèt...' 
                  : `Tann ${opponent.pseudo}...`}
              </p>
            </div>
          )}

          {!myBet && (
            <button
              onClick={handleCancel}
              className="w-full py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl transition-colors text-sm"
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