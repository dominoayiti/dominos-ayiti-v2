import { useState, useEffect } from 'react';
import { Gamepad2, X, Check } from 'lucide-react';
import { database } from '../firebase-config';
import { ref, onValue, remove, set,  update } from 'firebase/database';

const GameRequest = ({ currentUser, userData, onAccept }) => {
  const [pendingRequests, setPendingRequests] = useState([]);

  console.log('🔄 GameRequest rendu avec:', {
    currentUser: currentUser?.uid,
    pendingRequests: pendingRequests.length
  });

  useEffect(() => {
    if (!currentUser) {
      console.log('⚠️ GameRequest: Pas d\'utilisateur connecté');
      return;
    }

    console.log('🔊 GameRequest: Écoute des demandes pour UID =', currentUser.uid);

    const requestsRef = ref(database, `gameRequests/${currentUser.uid}`);
    
    const unsubscribe = onValue(requestsRef, (snapshot) => {
      const data = snapshot.val();
      
      console.log('📊 GameRequest: Données Firebase reçues =', data);
      
      if (data) {
        const requestsList = Object.entries(data)
          .filter(([_, req]) => req.status === 'pending')
          .map(([key, value]) => ({
            id: key,
            ...value
          }));
        
        console.log('✅ GameRequest: Demandes pending =', requestsList);
        setPendingRequests(requestsList);
      } else {
        console.log('ℹ️ GameRequest: Aucune demande trouvée');
        setPendingRequests([]);
      }
    }, (error) => {
      console.error('❌ GameRequest: Erreur Firebase =', error);
    });

    return () => {
      console.log('🛑 GameRequest: Nettoyage listener');
      unsubscribe();
    };
  }, [currentUser]);


  //accepter la demande de jeu
 const acceptRequest = async (request) => {
  try {
    console.log('✅ Acceptation demande:', request);
    
    // ✅ ÉTAPE 1: Marquer comme accepté dans la demande ORIGINALE
    await update(ref(database, `gameRequests/${currentUser.uid}/${request.from}`), {
      status: 'accepted',
      acceptedAt: Date.now(),
      acceptedBy: currentUser.uid
    });
    
    console.log('✅ Status mis à jour');
    
    // ✅ ÉTAPE 2: Notifier l'expéditeur
    await set(ref(database, `notifications/${request.from}/${Date.now()}`), {
      type: 'game_accepted',
      from: currentUser.uid,
      fromPseudo: userData?.pseudo || 'User',
      message: `${userData?.pseudo || 'User'} aksepte jwèt la!`,
      timestamp: Date.now(),
      read: false
    });
    
    console.log('✅ Notification envoyée');
    
    // Toast de confirmation
    const toastDiv = document.createElement('div');
    toastDiv.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-[9999] animate-slide-in';
    toastDiv.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-xl">✅</span>
        <span class="font-semibold">Ou aksepte jwèt la!</span>
      </div>
    `;
    document.body.appendChild(toastDiv);
    setTimeout(() => toastDiv.remove(), 3000);
    
    // ✅ Ouvrir le modal de mise
    if (onAccept) {
      const opponent = {
        uid: request.from,
        pseudo: request.fromPseudo,
        tokens: request.tokens || 0
      };
      onAccept(opponent);
    }
    
  } catch (error) {
    console.error('❌ Erreur acceptation jeu:', error);
    alert('Erè! Pa ka aksepte jwèt la.');
  }
};   

  //rejecter la demande
  const rejectRequest = async (request) => {
    try {
      console.log('❌ Refus demande:', request);
      
      await remove(ref(database, `gameRequests/${currentUser.uid}/${request.from}`));
      
      // Notifier l'expéditeur
      await set(ref(database, `notifications/${request.from}/${Date.now()}`), {
        type: 'game_rejected',
        from: currentUser.uid,
        fromPseudo: userData?.pseudo || 'User',
        message: `${userData?.pseudo || 'User'} refize jwèt la`,
        timestamp: Date.now(),
        read: false
      });

      // Toast de confirmation
      const toastDiv = document.createElement('div');
      toastDiv.className = 'fixed top-4 right-4 bg-gray-600 text-white px-6 py-3 rounded-lg shadow-lg z-[9999]';
      toastDiv.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-xl">ℹ️</span>
          <span class="font-semibold">Demann refize</span>
        </div>
      `;
      document.body.appendChild(toastDiv);
      setTimeout(() => toastDiv.remove(), 3000);

    } catch (error) {
      console.error('❌ Erreur rejet jeu:', error);
    }
  };

  if (pendingRequests.length === 0) {
    console.log('⏸️ GameRequest: Aucune demande à afficher (return null)');
    return null;
  }

  console.log('🎮 GameRequest: Affichage popup pour', pendingRequests.length, 'demande(s)');

  return (
    <>
      {pendingRequests.map((request) => (
        <div 
          key={request.id}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: 10000 }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border-4 border-green-500 animate-bounce-in">
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