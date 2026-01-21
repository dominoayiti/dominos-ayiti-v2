import React, { useState, useEffect } from 'react';
import { Users, Wifi, WifiOff, UserPlus, UserMinus, Gamepad2, Coins, User, LogOut, ArrowLeft, Search, X, Plus, DollarSign, MessageCircle, Send, Bell, Check, Loader } from 'lucide-react';
import { useAuth } from './useAuth';
import { database } from './firebase-config';
import { ref, onValue, update, remove, set } from 'firebase/database';

// ============================================
// CONFIGURATION - CHANGEZ L'URL DE VOTRE BACKEND ICI
// ============================================
//const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://dominos-ayiti-v2.onrender.com';

const BACKEND_URL = 'https://dominos-ayiti-v2.onrender.com';
const TokenRechargeModal = ({ onClose, currentTokens }) => {
  const { currentUser, userData } = useAuth();
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');

  const rechargeOptions = [
    { tokens: 10, price: '100', currency: 'HTG' },
    { tokens: 100, price: '500', currency: 'HTG' },
    { tokens: 200, price: '1,000', currency: 'HTG' },
    { tokens: 500, price: '2,500', currency: 'HTG' },
    { tokens: 1000, price: '5,000', currency: 'HTG' },
    { tokens: 2500, price: '12,500', currency: 'HTG' },
    { tokens: 5000, price: '25,000', currency: 'HTG' },
    { tokens: 10000, price: '50,000', currency: 'HTG' },
    { tokens: 20000, price: '100,000', currency: 'HTG' }
  ];

  const paymentMethods = [
    { id: 'moncash', name: 'MonCash', logo: '💰', color: 'from-red-500 to-red-600' },
    { id: 'natcash', name: 'NatCash', logo: '🏦', color: 'from-blue-500 to-blue-600' },
    { id: 'card', name: 'Kat Kredi', logo: '💳', color: 'from-purple-500 to-purple-600' },
    { id: 'paypal', name: 'PayPal', logo: '🌐', color: 'from-blue-400 to-blue-500' }
  ];

  // 🆕 Fonction pour gérer le paiement MonCash
  const handleMonCashPayment = async () => {
    if (!selectedAmount) {
      alert('Tanpri chwazi yon kantite jeton!');
      return;
    }

    if (!currentUser || !userData) {
      alert('Erè: Utilisateur non connecté');
      return;
    }

    setIsProcessing(true);
    setProcessingMessage('Kreye peman MonCash...');

    try {
      console.log('🔄 Création paiement MonCash...');

      // Étape 1: Créer le paiement sur le backend
      const response = await fetch(`${BACKEND_URL}/api/moncash/create-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseInt(selectedAmount.price.replace(/,/g, '')),
          tokens: selectedAmount.tokens,
          userId: currentUser.uid,
          userPseudo: userData.pseudo
        })
      });

      const data = await response.json();
      console.log('📊 Réponse backend:', data);

      if (!data.success) {
        throw new Error(data.error || 'Erreur création paiement');
      }

      // Étape 2: Sauvegarder l'orderId localement
      localStorage.setItem('pendingMonCashOrder', JSON.stringify({
        orderId: data.orderId,
        tokens: selectedAmount.tokens,
        amount: selectedAmount.price,
        timestamp: Date.now()
      }));

      setProcessingMessage('Rediksyon nan MonCash...');

      // Étape 3: Rediriger vers MonCash
      setTimeout(() => {
        window.location.href = data.redirectUrl;
      }, 1000);

    } catch (error) {
      console.error('❌ Erreur MonCash:', error);
      setIsProcessing(false);
      setProcessingMessage('');
      alert(`Erè! ${error.message}\n\nVerifye connexion internet ou eseye ankò.`);
    }
  };

  // 🆕 Vérifier les paiements en attente au chargement
useEffect(() => {
  const checkPendingPayment = async () => {
    const pendingOrder = localStorage.getItem('pendingMonCashOrder');
    
    if (pendingOrder) {
      const orderData = JSON.parse(pendingOrder);
      console.log('🔍 Paiement en attente détecté:', orderData);

      const isExpired = (Date.now() - orderData.timestamp) > 10 * 60 * 1000;
      
      if (isExpired) {
        localStorage.removeItem('pendingMonCashOrder');
        return;
      }

      const shouldVerify = window.confirm(
        `Ou te kòmanse yon peman MonCash pou ${orderData.tokens} jetons.\n\nÈske ou fini peye? Klike OK pou verifye.`
      );

      if (shouldVerify) {
        await verifyPayment(orderData.orderId);
      }
    }
  };

  checkPendingPayment();
}, [verifyPayment]); // ✅ Ajoutez verifyPayment ici

  // 🆕 Fonction pour vérifier un paiement
  const verifyPayment = async (orderId) => {
    setIsProcessing(true);
    setProcessingMessage('Verifikasyon peman...');

    try {
      const response = await fetch(`${BACKEND_URL}/api/moncash/verify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId })
      });

      const data = await response.json();

      if (data.success) {
        localStorage.removeItem('pendingMonCashOrder');
        alert(`🎉 Felisitasyon!\n\n${data.tokens} jetons ajoute nan kont ou.\n\nNouvo balans: ${data.newBalance} jetons`);
        onClose();
      } else {
        if (data.status === 'pending') {
          alert('⏳ Peman ou toujou nan trete.\n\nTanpri tann yon ti moman epi eseye ankò.');
        } else {
          alert('❌ Peman pa reyisi.\n\nEseye ankò oswa kontakte asistans.');
          localStorage.removeItem('pendingMonCashOrder');
        }
      }
    } catch (error) {
      console.error('❌ Erreur vérification:', error);
      alert(`Erè verifikasyon!\n\n${error.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  const handleRecharge = (method) => {
    if (!selectedAmount) {
      alert('Tanpri chwazi yon kantite jeton!');
      return;
    }

    if (method.id === 'moncash') {
      handleMonCashPayment();
    } else {
      alert(`Rechaj ${selectedAmount.tokens} jetons pou ${selectedAmount.price} ${selectedAmount.currency} avèk ${method.name}.\n\nFonksyon peman ap vini byento!`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold text-white">Rechaje Jeton</h2>
              <div className="flex items-center bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-lg px-4 py-2 shadow-lg">
                <Coins className="w-5 h-5 text-white mr-2" />
                <span className="text-white font-bold text-lg">{currentTokens}</span>
              </div>
            </div>
            <button 
              onClick={onClose}
              disabled={isProcessing}
              className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded">
            <p className="text-sm text-yellow-800">
              ⚠️ <strong>Nòt:</strong> 1000 jeton gratis yo pa ka retire. Achte jeton pou ka genyen lajan reyèl!
            </p>
          </div>

          {isProcessing && (
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6 rounded">
              <div className="flex items-center gap-3">
                <Loader className="w-5 h-5 text-blue-600 animate-spin" />
                <p className="text-sm text-blue-800 font-semibold">{processingMessage}</p>
              </div>
            </div>
          )}

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Chwazi Kantite Jeton</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {rechargeOptions.map((option) => (
                <button
                  key={option.tokens}
                  onClick={() => setSelectedAmount(option)}
                  disabled={isProcessing}
                  className={`p-4 rounded-xl border-2 transition-all disabled:opacity-50 ${
                    selectedAmount?.tokens === option.tokens
                      ? 'border-green-600 bg-green-50 shadow-lg scale-105'
                      : 'border-gray-200 hover:border-green-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center justify-center mb-2">
                    <Coins className={`w-6 h-6 ${
                      selectedAmount?.tokens === option.tokens ? 'text-green-600' : 'text-yellow-500'
                    }`} />
                  </div>
                  <p className="font-bold text-gray-800 text-lg">{option.tokens.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">Jetons</p>
                  <p className="text-green-600 font-bold mt-1">{option.price} {option.currency}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-gray-800 mb-4">Chwazi Mwayen Peman</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {paymentMethods.map((method) => (
                <button
                  key={method.id}
                  onClick={() => handleRecharge(method)}
                  disabled={!selectedAmount || isProcessing}
                  className={`p-4 rounded-xl bg-gradient-to-r ${method.color} text-white font-bold flex items-center justify-center gap-3 transition-all ${
                    selectedAmount && !isProcessing
                      ? 'hover:scale-105 hover:shadow-xl cursor-pointer' 
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span className="text-3xl">{method.logo}</span>
                  <span className="text-lg">{method.name}</span>
                  {method.id === 'moncash' && (
                    <span className="ml-2 bg-white/20 px-2 py-1 rounded text-xs">ACTIF</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-full mt-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl transition-colors disabled:opacity-50"
          >
            Fèmen
          </button>
        </div>
      </div>
    </div>
  );
};


// 🆕 Modal pour les demandes d'ami
const FriendRequestsModal = ({ currentUser, userData, onClose }) => {
  const [requests, setRequests] = useState([]);
  const [processing, setProcessing] = useState(false);
  const previousRequestsLength = useRef(0); // ✅ Ajoutez cette ligne

  useEffect(() => {
    if (!currentUser) return;

    const requestsRef = ref(database, `friendRequests/${currentUser.uid}`);
    const unsubscribe = onValue(requestsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const requestsList = Object.entries(data).map(([key, value]) => ({
          id: key,
          ...value
        }));
        setRequests(requestsList);
        previousRequestsLength.current = requestsList.length; // ✅ Mettez à jour la ref
      } else {
        // Fermer automatiquement le modal s'il n'y a plus de demandes
        if (previousRequestsLength.current > 0) { // ✅ Utilisez la ref
          onClose();
        }
        setRequests([]);
        previousRequestsLength.current = 0; // ✅ Reset la ref
      }
    });

    return () => unsubscribe();
  }, [currentUser, onClose]); // ✅ Seulement currentUser et onClose

  const acceptRequest = async (request) => {
    if (processing) return;
    setProcessing(true);

    try {
      console.log('🔄 Début acceptation...');
      
      // 1. Supprimer la demande EN PREMIER (pour éviter le bug du modal)
      await remove(ref(database, `friendRequests/${currentUser.uid}/${request.id}`));
      console.log('✅ Demande supprimée');

      // 2. Ajouter dans les deux sens
      await set(ref(database, `users/${currentUser.uid}/friends/${request.fromUid}`), {
        uid: request.fromUid,
        pseudo: request.fromPseudo,
        addedAt: Date.now()
      });

      await set(ref(database, `users/${request.fromUid}/friends/${currentUser.uid}`), {
        uid: currentUser.uid,
        pseudo: userData?.pseudo || 'User',
        addedAt: Date.now()
      });

      console.log('✅ Amis ajoutés des deux côtés');

      // 3. Notifier l'expéditeur (Kiki) que sa demande a été acceptée
      await set(ref(database, `notifications/${request.fromUid}/${Date.now()}`), {
        type: 'friend_accepted',
        from: currentUser.uid,
        fromPseudo: userData?.pseudo || 'User',
        message: `${userData?.pseudo || 'User'} aksepte demann zanmi ou!`,
        timestamp: Date.now(),
        read: false
      });

      console.log('✅ Notification envoyée à', request.fromPseudo);

      // 4. Afficher un toast de succès pour l'utilisateur actuel (haytifx)
      const toastDiv = document.createElement('div');
      toastDiv.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-[9999] animate-slide-in';
      toastDiv.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-xl">✅</span>
          <span class="font-semibold">Nou zanmi kounye a ak ${request.fromPseudo}!</span>
        </div>
      `;
      document.body.appendChild(toastDiv);
      setTimeout(() => toastDiv.remove(), 3000);

      console.log('✅ Acceptation terminée avec succès');
    } catch (error) {
      console.error('❌ Erreur acceptation:', error);
      
      // Toast d'erreur au lieu d'alert
      const errorToast = document.createElement('div');
      errorToast.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-[9999]';
      errorToast.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-xl">❌</span>
          <span class="font-semibold">Erè! Pa ka aksepte demann lan. Eseye ankò.</span>
        </div>
      `;
      document.body.appendChild(errorToast);
      setTimeout(() => errorToast.remove(), 3000);
    } finally {
      setProcessing(false);
    }
  };

  const rejectRequest = async (request) => {
    if (processing) return;
    setProcessing(true);

    try {
      console.log('🔄 Début refus...');
      
      // 1. Supprimer la demande EN PREMIER
      await remove(ref(database, `friendRequests/${currentUser.uid}/${request.id}`));
      console.log('✅ Demande supprimée');
      
      // 2. Notifier l'expéditeur que la demande a été refusée
      await set(ref(database, `notifications/${request.fromUid}/${Date.now()}`), {
        type: 'friend_rejected',
        from: currentUser.uid,
        fromPseudo: userData?.pseudo || 'User',
        message: `${userData?.pseudo || 'User'} refize demann zanmi ou.`,
        timestamp: Date.now(),
        read: false
      });

      console.log('✅ Notification de refus envoyée');

      // 3. Toast de confirmation pour l'utilisateur actuel
      const toastDiv = document.createElement('div');
      toastDiv.className = 'fixed top-4 right-4 bg-gray-600 text-white px-6 py-3 rounded-lg shadow-lg z-[9999]';
      toastDiv.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-xl">ℹ️</span>
          <span class="font-semibold">Demann ${request.fromPseudo} refize</span>
        </div>
      `;
      document.body.appendChild(toastDiv);
      setTimeout(() => toastDiv.remove(), 3000);

      console.log('✅ Refus terminé avec succès');
    } catch (error) {
      console.error('❌ Erreur rejet:', error);
      
      const errorToast = document.createElement('div');
      errorToast.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-[9999]';
      errorToast.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-xl">❌</span>
          <span class="font-semibold">Erè! Pa ka refize demann lan. Eseye ankò.</span>
        </div>
      `;
      document.body.appendChild(errorToast);
      setTimeout(() => errorToast.remove(), 3000);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 rounded-t-2xl flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-white" />
            <h2 className="text-xl font-bold text-white">Demann Zanmi</h2>
            {requests.length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                {requests.length}
              </span>
            )}
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="p-4">
          {requests.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Pa gen demann zanmi</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((request) => (
                <div key={request.id} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                        <User className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-800">{request.fromPseudo}</p>
                        <p className="text-xs text-gray-600">Vle ajoute ou kòm zanmi</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptRequest(request)}
                        disabled={processing}
                        className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Aksepte"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => rejectRequest(request)}
                        disabled={processing}
                        className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Refize"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};










const MultiplayerMenu = ({ onBack, playerTokens }) => {
  const { currentUser, userData, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('online');
  const [allPlayers, setAllPlayers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [showFriendRequests, setShowFriendRequests] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Charger tous les joueurs
  useEffect(() => {
    if (!currentUser) return;

    console.log('🔄 Chargement des joueurs...');
    
    const usersRef = ref(database, 'users');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      console.log('📊 Données Firebase brutes:', data);
      
      if (data) {
        const playersList = Object.entries(data)
          .map(([uid, userData]) => ({
            uid,
            pseudo: userData.pseudo || 'Sans nom',
            email: userData.email || '',
            tokens: userData.tokens || 0,
            online: userData.online === true,
            lastSeen: userData.lastSeen || Date.now(),
            stats: userData.stats || { played: 0, won: 0, lost: 0 }
          }))
          .filter(player => player.pseudo !== 'Admin'); 
        
        console.log('👥 TOUS les joueurs chargés:', playersList.length);
        console.log('🟢 Joueurs en ligne:', playersList.filter(p => p.online).length);
        
        setAllPlayers(playersList);
      } else {
        console.log('⚠️ Aucune donnée utilisateur trouvée');
        setAllPlayers([]);
      }
    }, (error) => {
      console.error('❌ Erreur chargement joueurs:', error);
    });

    return () => {
      console.log('🛑 Nettoyage listener joueurs');
      unsubscribe();
    };
  }, [currentUser]);

  // Charger la liste d'amis
  useEffect(() => {
    if (!currentUser) return;

    const friendsRef = ref(database, `users/${currentUser.uid}/friends`);
    const unsubscribe = onValue(friendsRef, (snapshot) => {
      const data = snapshot.val();
      console.log('👫 Amis Firebase:', data);
      
      if (data) {
        setFriends(Object.values(data));
      } else {
        setFriends([]);
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 🆕 Écouter les demandes d'ami reçues
  useEffect(() => {
    if (!currentUser) return;

    const requestsRef = ref(database, `friendRequests/${currentUser.uid}`);
    const unsubscribe = onValue(requestsRef, (snapshot) => {
      const data = snapshot.val();
      setPendingRequestsCount(data ? Object.keys(data).length : 0);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const isFriend = (uid) => {
    return friends.some(f => f.uid === uid);
  };

  const filteredPlayers = allPlayers
    .filter(player => player.uid !== currentUser.uid)
    .filter(player => 
      player.pseudo?.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const onlinePlayers = filteredPlayers.filter(p => p.online);
  const offlinePlayers = filteredPlayers.filter(p => !p.online);

  const friendsList = allPlayers.filter(player => 
    friends.some(friend => friend.uid === player.uid)
  );
  const onlineFriends = friendsList.filter(f => f.online);
  const offlineFriends = friendsList.filter(f => !f.online);

  // 🆕 Fonction pour envoyer une demande d'ami
  const sendFriendRequest = async (toUid, toPseudo) => {
    if (!currentUser || !userData) return;

    try {
      const requestRef = ref(database, `friendRequests/${toUid}/${currentUser.uid}`);
      await set(requestRef, {
        fromUid: currentUser.uid,
        fromPseudo: userData.pseudo,
        toUid: toUid,
        toPseudo: toPseudo,
        timestamp: Date.now(),
        status: 'pending'
      });

      alert(`Demann zanmi voye bay ${toPseudo}!`);
    } catch (error) {
      console.error('❌ Erreur envoi demande:', error);
    }
  };

  const removeFriend = async (friendUid) => {
    if (!currentUser) return;

    try {
      const friendRef = ref(database, `users/${currentUser.uid}/friends/${friendUid}`);
      await remove(friendRef);
      console.log('✅ Ami retiré');
    } catch (error) {
      console.error('❌ Erreur suppression ami:', error);
    }
  };

  const proposeGame = async (opponentUid, opponentPseudo) => {
    if (!currentUser || !userData) return;

    try {
      const gameRequestRef = ref(database, `gameRequests/${opponentUid}/${currentUser.uid}`);
      await update(gameRequestRef, {
        from: currentUser.uid,
        fromPseudo: userData.pseudo,
        to: opponentUid,
        toPseudo: opponentPseudo,
        status: 'pending',
        timestamp: Date.now()
      });

      alert(`Demann jwèt voye bay ${opponentPseudo}!`);
    } catch (error) {
      console.error('❌ Erreur proposition jeu:', error);
    }
  };

  const handleLogout = async () => {
    await logout();
    onBack();
  };

  return (
    <div className="min-h-screen bg-cover bg-center p-3" style={{backgroundImage: 'url(/gran_lakou.jpg)'}}>
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-2 mb-2 flex justify-between items-center">
          <button onClick={onBack} className="flex items-center text-gray-700 hover:text-green-600">
            <ArrowLeft className="w-4 h-4 mr-1" />
            <span className="font-bold text-sm">Tounen</span>
          </button>

          <div className="flex items-center gap-2">
            {/* 🆕 Bouton notification demandes d'ami */}
            <button
              onClick={() => setShowFriendRequests(true)}
              className="relative p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-lg"
              title="Demann zanmi"
            >
              <Bell className="w-4 h-4" />
              {pendingRequestsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center animate-pulse">
                  {pendingRequestsCount}
                </span>
              )}
            </button>

            <div className="flex items-center gap-1">
              <div className="flex items-center bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-lg px-3 py-1.5 shadow-lg">
                <Coins className="w-4 h-4 text-white mr-1" />
                <span className="text-white font-bold text-sm">{userData?.tokens || playerTokens}</span>
              </div>
              <button
                onClick={() => setShowRechargeModal(true)}
                className="w-8 h-8 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 rounded-lg flex items-center justify-center transition-all hover:scale-110 shadow-lg"
                title="Rechaje Jeton"
              >
                <Plus className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="relative">
              <button 
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="w-8 h-8 bg-gradient-to-br from-green-600 to-green-700 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
              >
                <User className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>

        {showProfileMenu && (
          <>
            <div 
              className="fixed inset-0 z-[90]" 
              onClick={() => setShowProfileMenu(false)}
            />
            <div className="fixed right-3 top-16 w-56 bg-white rounded-lg shadow-2xl py-2 z-[100] border border-gray-200">
              <div className="px-4 py-3 border-b bg-gradient-to-r from-green-50 to-emerald-50">
                <p className="font-bold text-gray-800">{userData?.pseudo}</p>
                <p className="text-xs text-gray-500">{userData?.email}</p>
              </div>
              
              <button 
                onClick={() => {
                  setShowProfileMenu(false);
                  alert('Fonksyon Retrè lajan ap vini byento!');
                }}
                className="w-full px-4 py-3 text-left text-gray-700 hover:bg-green-50 flex items-center transition-colors"
              >
                <DollarSign className="w-4 h-4 mr-3 text-green-600" />
                <span>Retrè Lajan</span>
              </button>

              <button 
                onClick={() => {
                  setShowProfileMenu(false);
                  alert('Mesaj Asistans ap vini byento!');
                }}
                className="w-full px-4 py-3 text-left text-gray-700 hover:bg-blue-50 flex items-center transition-colors"
              >
                <MessageCircle className="w-4 h-4 mr-3 text-blue-600" />
                <span>Mesaj Asistans</span>
              </button>

              <div className="border-t my-1"></div>

              <button 
                onClick={() => {
                  window.open('https://wa.me/', '_blank');
                  setShowProfileMenu(false);
                }}
                className="w-full px-4 py-3 text-left text-gray-700 hover:bg-green-50 flex items-center transition-colors"
              >
                <Send className="w-4 h-4 mr-3 text-green-500" />
                <span>WhatsApp</span>
              </button>

              <button 
                onClick={() => {
                  window.open('https://facebook.com/', '_blank');
                  setShowProfileMenu(false);
                }}
                className="w-full px-4 py-3 text-left text-gray-700 hover:bg-blue-50 flex items-center transition-colors"
              >
                <svg className="w-4 h-4 mr-3 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                <span>Facebook</span>
              </button>

              <button 
                onClick={() => {
                  window.open('https://tiktok.com/', '_blank');
                  setShowProfileMenu(false);
                }}
                className="w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-50 flex items-center transition-colors"
              >
                <svg className="w-4 h-4 mr-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                </svg>
                <span>TikTok</span>
              </button>

              <div className="border-t my-1"></div>

              <button 
                onClick={handleLogout}
                className="w-full px-4 py-3 text-left text-red-600 hover:bg-red-50 flex items-center transition-colors"
              >
                <LogOut className="w-4 h-4 mr-3" />
                <span className="font-semibold">Dekonekte</span>
              </button>
            </div>
          </>
        )}

        <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg mb-2">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('online')}
              className={`flex-1 py-2.5 px-3 font-bold flex items-center justify-center gap-2 transition-colors text-sm ${
                activeTab === 'online' 
                  ? 'bg-green-600 text-white' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Wifi className="w-4 h-4" />
              Jwè An Liy
            </button>
            <button
              onClick={() => setActiveTab('friends')}
              className={`flex-1 py-2.5 px-3 font-bold flex items-center justify-center gap-2 transition-colors text-sm ${
                activeTab === 'friends' 
                  ? 'bg-green-600 text-white' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Users className="w-4 h-4" />
              Zanmi ({friends.length})
            </button>
          </div>

          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Chache yon jwè..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-8 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />


              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2"
                >
                  <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
          </div>


          

          <div className="p-2 max-h-[calc(100vh-280px)] overflow-y-auto">
            {activeTab === 'online' && (
              <>
                {onlinePlayers.length > 0 && (
                  <div className="mb-3">
                    <h3 className="text-xs font-bold text-green-600 mb-1.5 flex items-center">
                      <Wifi className="w-3 h-3 mr-1" />
                      An Liy ({onlinePlayers.length})
                    </h3>
                    {onlinePlayers.map(player => (
                      <div key={player.uid} className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-800 text-sm">{player.pseudo}</p>
                            <div className="flex items-center gap-1">
                              <Wifi className="w-2.5 h-2.5 text-green-500" />
                              <span className="text-xs text-green-600">An liy</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {!isFriend(player.uid) ? (
                            <button
                              onClick={() => sendFriendRequest(player.uid, player.pseudo)}
                              className="p-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                              title="Voye demann zanmi"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => removeFriend(player.uid)}
                              className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                              title="Retire nan zanmi"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => proposeGame(player.uid, player.pseudo)}
                            className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                            title="Pwopoze yon pati"
                          >
                            <Gamepad2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {offlinePlayers.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 mb-1.5 flex items-center">
                      <WifiOff className="w-3 h-3 mr-1" />
                      Pa An Liy ({offlinePlayers.length})
                    </h3>
                    {offlinePlayers.map(player => (
                      <div key={player.uid} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-2 mb-1.5 opacity-60">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-800 text-sm">{player.pseudo}</p>
                            <div className="flex items-center gap-1">
                              <WifiOff className="w-2.5 h-2.5 text-gray-400" />
                              <span className="text-xs text-gray-500">Pa an liy</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {!isFriend(player.uid) && (
                            <button
                              onClick={() => sendFriendRequest(player.uid, player.pseudo)}
                              className="p-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                              title="Voye demann zanmi"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {filteredPlayers.length === 0 && (
                  <div className="text-center py-6 text-gray-500">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Pa gen jwè ki disponib</p>
                  </div>
                )}
              </>
            )}

            {activeTab === 'friends' && (
              <>
                {onlineFriends.length > 0 && (
                  <div className="mb-3">
                    <h3 className="text-xs font-bold text-green-600 mb-1.5 flex items-center">
                      <Wifi className="w-3 h-3 mr-1" />
                      An Liy ({onlineFriends.length})
                    </h3>
                    {onlineFriends.map(friend => (
                      <div key={friend.uid} className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-800 text-sm">{friend.pseudo}</p>
                            <div className="flex items-center gap-1">
                              <Wifi className="w-2.5 h-2.5 text-green-500" />
                              <span className="text-xs text-green-600">An liy</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => removeFriend(friend.uid)}
                            className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                            title="Retire nan zanmi"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => proposeGame(friend.uid, friend.pseudo)}
                            className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                            title="Pwopoze yon pati"
                          >
                            <Gamepad2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {offlineFriends.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 mb-1.5 flex items-center">
                      <WifiOff className="w-3 h-3 mr-1" />
                      Pa An Liy ({offlineFriends.length})
                    </h3>
                    {offlineFriends.map(friend => (
                      <div key={friend.uid} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-2 mb-1.5 opacity-60">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-800 text-sm">{friend.pseudo}</p>
                            <div className="flex items-center gap-1">
                              <WifiOff className="w-2.5 h-2.5 text-gray-400" />
                              <span className="text-xs text-gray-500">Pa an liy</span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => removeFriend(friend.uid)}
                          className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                          title="Retire nan zanmi"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {friendsList.length === 0 && (
                  <div className="text-center py-6 text-gray-500">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Ou poko gen zanmi</p>
                    <p className="text-xs mt-1">Ale nan tab "Jwè An Liy" pou ajoute zanmi</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showRechargeModal && (
        <TokenRechargeModal 
          onClose={() => setShowRechargeModal(false)} 
          currentTokens={userData?.tokens || playerTokens}
        />
      )}

      {showFriendRequests && (
        <FriendRequestsModal 
          currentUser={currentUser}
          userData={userData}
          onClose={() => setShowFriendRequests(false)}
        />
      )}
    </div>
  );
};

export default MultiplayerMenu;