import React, { useState, useEffect } from 'react';
import { Loader, User, Coins, ArrowLeft } from 'lucide-react';
import { database } from '../firebase-config';
import { ref, onValue } from 'firebase/database';

const MultiplayerGame = ({ gameData, currentUser, onExit }) => {
  const [bothPlayersReady, setBothPlayersReady] = useState(false);
  const [waitingFor, setWaitingFor] = useState(null);

  useEffect(() => {
    if (!gameData?.sessionId) return;

    // Écouter les deux mises pour vérifier que les deux joueurs sont prêts
    const player1BetRef = ref(database, `gameBets/${gameData.sessionId}/${gameData.player1Uid}`);
    const player2BetRef = ref(database, `gameBets/${gameData.sessionId}/${gameData.player2Uid}`);

    let player1Ready = false;
    let player2Ready = false;

    const checkBothReady = () => {
      if (player1Ready && player2Ready) {
        console.log('✅ Les deux joueurs sont prêts!');
        setBothPlayersReady(true);
        setWaitingFor(null);
      }
    };

    const unsubscribe1 = onValue(player1BetRef, (snapshot) => {
      player1Ready = snapshot.exists();
      
      if (!player1Ready && currentUser.uid === gameData.player2Uid) {
        setWaitingFor(gameData.player1Pseudo);
      }
      
      checkBothReady();
    });

    const unsubscribe2 = onValue(player2BetRef, (snapshot) => {
      player2Ready = snapshot.exists();
      
      if (!player2Ready && currentUser.uid === gameData.player1Uid) {
        setWaitingFor(gameData.player2Pseudo);
      }
      
      checkBothReady();
    });

    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, [gameData, currentUser]);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-green-900 via-green-700 to-emerald-900 flex items-center justify-center z-[150]">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full mx-4">
        {!bothPlayersReady ? (
          // Popup d'attente
          <div className="text-center">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <Loader className="w-12 h-12 text-blue-600 animate-spin" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Tann {waitingFor}...
            </h2>
            
            <p className="text-gray-600 mb-6">
              Jwèt ap kòmanse lè {waitingFor} fini mize.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  <span className="font-bold text-gray-800">{gameData.player1Pseudo}</span>
                </div>
                <div className="flex items-center gap-2 bg-green-500 text-white px-3 py-1 rounded-lg">
                  <Coins className="w-4 h-4" />
                  <span className="font-bold">{gameData.bet}</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  <span className="font-bold text-gray-800">{gameData.player2Pseudo}</span>
                </div>
                {currentUser.uid === gameData.player1Uid ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Tann mise...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-green-500 text-white px-3 py-1 rounded-lg">
                    <Coins className="w-4 h-4" />
                    <span className="font-bold">{gameData.bet}</span>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={onExit}
              className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 mx-auto"
            >
              <ArrowLeft className="w-5 h-5" />
              Kite Jwèt
            </button>
          </div>
        ) : (
          // Interface du jeu (à développer)
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">
              Jwèt Miltijoueur
            </h1>
            <p className="text-gray-600 mb-6">
              Interface jwèt ap vini byento...
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-700">
                <span className="font-bold">Ou:</span> {
                  currentUser.uid === gameData.player1Uid 
                    ? gameData.player1Pseudo 
                    : gameData.player2Pseudo
                }
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-bold">Advèsè:</span> {
                  currentUser.uid === gameData.player1Uid 
                    ? gameData.player2Pseudo 
                    : gameData.player1Pseudo
                }
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-bold">Mise:</span> {gameData.bet} jetons
              </p>
            </div>
            <button
              onClick={onExit}
              className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-xl transition-colors"
            >
              Kite Jwèt
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiplayerGame;