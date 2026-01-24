import React from 'react';

const MultiplayerGame = ({ gameData, currentUser, onExit }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-700 to-emerald-900 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">
          Jwèt Miltijoueur
        </h1>
        <p className="text-gray-600 mb-6">
          Interface jwèt ap vini byento...
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-700">
            <span className="font-bold">Ou:</span> {gameData.player1Pseudo}
          </p>
          <p className="text-sm text-gray-700">
            <span className="font-bold">Advèsè:</span> {gameData.player2Pseudo}
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
    </div>
  );
};

export default MultiplayerGame;