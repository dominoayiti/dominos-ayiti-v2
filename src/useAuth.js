import { useState, useEffect } from 'react';
import { auth, database } from './firebase-config';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { ref, set, onValue, update, get, onDisconnect } from 'firebase/database';

export const useAuth = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        // Vérifier si l'utilisateur existe dans la base de données
        const userRef = ref(database, `users/${user.uid}`);
        const snapshot = await get(userRef);
        
        if (!snapshot.exists()) {
          // Si l'utilisateur n'existe pas, créer son profil
          await set(userRef, {
            pseudo: user.email.split('@')[0], // Utiliser la partie avant @ comme pseudo par défaut
            email: user.email,
            tokens: 1000,
            createdAt: Date.now(),
            online: true,
            lastSeen: Date.now(),
            stats: {
              played: 0,
              won: 0,
              lost: 0
            },
            friends: []
          });
        } else {
          // Mettre à jour le statut en ligne
          await update(userRef, {
            online: true,
            lastSeen: Date.now()
          });
        }

        // Configurer la déconnexion automatique avec onDisconnect
        // Cela garantit que le statut sera mis à offline même si l'app crash
        onDisconnect(userRef).update({
          online: false,
          lastSeen: Date.now()
        });
      } else {
        setUserData(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Écoute des données utilisateur
  useEffect(() => {
    if (!currentUser) {
      setUserData(null);
      return;
    }

    const userRef = ref(database, `users/${currentUser.uid}`);
    const unsubscribeUser = onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setUserData(data);
      }
    }, (error) => {
      console.error('Erreur lecture données utilisateur:', error);
    });

    // Fonction pour mettre offline lors de la fermeture (backup supplémentaire)
    const handleBeforeUnload = () => {
      const userRef = ref(database, `users/${currentUser.uid}`);
      update(userRef, { 
        online: false, 
        lastSeen: Date.now() 
      }).catch(() => {});
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsubscribeUser();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Mettre offline quand le composant se démonte (backup supplémentaire)
      if (currentUser) {
        update(ref(database, `users/${currentUser.uid}`), { 
          online: false, 
          lastSeen: Date.now() 
        }).catch(() => {});
      }
    };
  }, [currentUser]);

  const signup = async (email, password, pseudo) => {
    try {
      // Vérifier que tous les champs sont remplis
      if (!email || !password || !pseudo) {
        return { 
          success: false, 
          error: 'Tanpri ranpli tout chan yo' 
        };
      }

      // Vérifier la longueur du mot de passe
      if (password.length < 6) {
        return { 
          success: false, 
          error: 'Modpas la dwe gen omwen 6 karaktè' 
        };
      }

      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      // Créer le profil utilisateur dans la base de données
      const userRef = ref(database, `users/${result.user.uid}`);
      await set(userRef, {
        pseudo: pseudo,
        email: email,
        tokens: 1000,
        createdAt: Date.now(),
        online: true,
        lastSeen: Date.now(),
        stats: {
          played: 0,
          won: 0,
          lost: 0
        },
        friends: []
      });

      // Configurer la déconnexion automatique
      onDisconnect(userRef).update({
        online: false,
        lastSeen: Date.now()
      });

      return { success: true };
    } catch (error) {
      console.error('Erreur signup:', error);
      
      // Messages d'erreur en créole
      let errorMessage = 'Erè nan kreyasyon kont lan';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'Imel sa a deja itilize';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Imel sa a pa valid';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Modpas la twò fèb';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Pwoblèm koneksyon entènèt';
      }
      
      return { success: false, error: errorMessage };
    }
  };

  const login = async (email, password) => {
    try {
      // Vérifier que tous les champs sont remplis
      if (!email || !password) {
        return { 
          success: false, 
          error: 'Tanpri ranpli tout chan yo' 
        };
      }

      const result = await signInWithEmailAndPassword(auth, email, password);
      
      // Mettre à jour le statut en ligne immédiatement
      const userRef = ref(database, `users/${result.user.uid}`);
      await update(userRef, {
        online: true,
        lastSeen: Date.now()
      });

      // Configurer la déconnexion automatique
      onDisconnect(userRef).update({
        online: false,
        lastSeen: Date.now()
      });

      return { success: true };
    } catch (error) {
      console.error('Erreur login:', error);
      
      // Messages d'erreur en créole
      let errorMessage = 'Erè nan koneksyon an';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'Itilizatè sa a pa egziste';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Modpas la pa kòrèk';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Imel sa a pa valid';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'Kont sa a dezaktive';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Twòp tantativ. Eseye ankò nan kèk minit';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Pwoblèm koneksyon entènèt';
      } else if (error.code === 'auth/invalid-credential') {
        errorMessage = 'Imel oswa modpas enkòrèk';
      }
      
      return { success: false, error: errorMessage };
    }
  };

  const logout = async () => {
    try {
      if (currentUser) {
        await update(ref(database, `users/${currentUser.uid}`), {
          online: false,
          lastSeen: Date.now()
        });
      }
      await signOut(auth);
      return { success: true };
    } catch (error) {
      console.error('Erreur logout:', error);
      return { success: false, error: 'Erè nan dekoneksyon an' };
    }
  };

  return {
    currentUser,
    userData,
    loading,
    signup,
    login,
    logout
  };
};