import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

// ✅ Remplacez par VOTRE configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDnzRlVTk2NrefFqVHSEM6B_iJQ_o2EPSI",
  authDomain: "domino-ayiti.firebaseapp.com",
  projectId: "domino-ayiti",
  storageBucket: "domino-ayiti.firebasestorage.app",
  messagingSenderId: "758617305468",
  appId: "1:758617305468:web:18430035d1467c985634f9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services
export const auth = getAuth(app);
export const database = getDatabase(app);
export default app;

