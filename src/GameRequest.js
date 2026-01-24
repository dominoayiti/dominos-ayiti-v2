import { useState, useEffect } from 'react';
import { Gamepad2, X, Check, Loader } from 'lucide-react';
import { database } from '../firebase-config';
import { ref, onValue, remove, set } from 'firebase/database';

const GameRequest = ({ currentUser, userData, onAccept }) => {
  const [pendingRequests, setPendingRequests] = useState([]);

  useEffect(() => {
    if (!currentUser) return;

    const requestsRef = ref(database, `gameRequests/${currentUser.uid}`);
    const unsubscribe = onValue(requestsRef, (snapshot) => {
      const data = snapshot.val();
      
      if (data) {
        const requestsList = Object.entries(data)
          .filter(([_, req]) => req.status === 'pending')
          .map(([key, value]) => ({
            id: key,
            ...value
          }));
        
        setPendingRequests(requestsList);
      } else {
        setPendingRequests([]);
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  const acceptRequest = async (request) => {
    try {
      console.log('✅ Demande de jeu acceptée:', request);
      
      // Supprimer la demande
      await remove(ref(database, `gameRequests/${currentUser.uid}/${request.from}`));
      
      // Appeler la fonction pour ouvrir le modal de mise
      if (onAccept) {
        onAccept(request);
      }
    } catch (error) {
      console.error('❌ Erreur acceptation jeu:', error);
    }
  };

  const rejectRequest = async (request) => {
    try {
      await remove(ref(database, `gameRequests/${currentUser.uid}/${request.from}`));
      
      // Notifier l'autre joueur
      await set(ref(database, `notifications/${request.from}/${Date.now()}`), {
        type: 'game_rejected',
        from: currentUser.uid,
        fromPseudo: userData?.pseudo || 'User',
        message: `${userData?.pseudo || 'User'} refize jwèt la`,
        timestamp: Date.now(),
        read: false
      });

      console.log('❌ Demande de jeu refusée');
    } catch (error) {
      console.error('❌ Erreur rejet jeu:', error);
    }
  };

  if (pendingRequests.length === 0) return null;

  return (
    <>
      {pendingRequests.map((request) => (
        <div 
          key={request.id}
          className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[200] animate-bounce-in"
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border-4 border-green-500">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                <Gamepad2 className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Demann Jwèt!</h3>
              <p className="text-gray-600">
                <span className="font-bold text-green-600">{request.fromPseudo}</span>
                {' '}vle jwe domino avèk ou!
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => rejectRequest(request)}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <X className="w-5 h-5" />
                Refize
              </button>
              <button
                onClick={() => acceptRequest(request)}
                className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                Aksepte
              </button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
};

export default GameRequest;