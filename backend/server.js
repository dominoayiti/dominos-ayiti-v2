// server.js - Backend Node.js pour gérer les paiements MonCash
// VERSION PRODUCTION avec mode LIVE MonCash - CORRIGÉE

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// MIDDLEWARE CORS - CORRIGÉ
// ============================================
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173', // Vite local
    'https://glittery-buttercream-2cf125.netlify.app',
    /\.netlify\.app$/ // Accepte tous les sous-domaines Netlify
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ============================================
// CONFIGURATION MONCASH - MODE LIVE
// ============================================
const MONCASH_CONFIG = {
  mode: process.env.MONCASH_MODE || 'sandbox', // ✅ 'sandbox' ou 'live'
  clientId: process.env.MONCASH_CLIENT_ID,
  clientSecret: process.env.MONCASH_CLIENT_SECRET,
  // ✅ Détection automatique de l'URL selon le mode
  baseUrl: (process.env.MONCASH_MODE === 'live') 
    ? 'https://moncashbutton.digicelgroup.com'  // PRODUCTION
    : 'https://sandbox.moncashbutton.digicelgroup.com'  // SANDBOX
};

// 🔒 Vérification des variables d'environnement
const requiredEnvVars = [
  'MONCASH_CLIENT_ID',
  'MONCASH_CLIENT_SECRET',
  'BACKEND_URL',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('❌ VARIABLES MANQUANTES:', missingVars.join(', '));
  console.error('⚠️  Le serveur va démarrer mais certaines fonctionnalités ne marcheront pas!');
}

// ⚠️ AVERTISSEMENT MODE PRODUCTION
if (MONCASH_CONFIG.mode === 'live') {
  console.log('🚨 ========================================');
  console.log('🚨 MODE PRODUCTION ACTIVÉ (LIVE)');
  console.log('🚨 Les paiements vont débiter de vrais comptes!');
  console.log('🚨 ========================================');
}

// ============================================
// CONFIGURATION FIREBASE ADMIN
// ============================================
if (
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY
) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      }),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`
    });
    console.log('✅ Firebase Admin initialisé');
  } catch (error) {
    console.error('❌ Erreur initialisation Firebase:', error.message);
  }
} else {
  console.error('❌ Variables Firebase manquantes');
}

const db = admin.apps.length ? admin.database() : null;

// ============================================
// FONCTION : OBTENIR TOKEN MONCASH (timeout 30s)
// ============================================
async function getMonCashToken() {
  const startTime = Date.now();
  
  try {
    if (!MONCASH_CONFIG.clientId || !MONCASH_CONFIG.clientSecret) {
      throw new Error('Credentials MonCash manquants');
    }

    const auth = Buffer.from(
      `${MONCASH_CONFIG.clientId}:${MONCASH_CONFIG.clientSecret}`
    ).toString('base64');

    console.log(`🔄 [MonCash-${MONCASH_CONFIG.mode}] Demande token...`);

    const response = await axios.post(
      `${MONCASH_CONFIG.baseUrl}/Api/oauth/token`,
      'scope=read,write&grant_type=client_credentials',
      {
        timeout: 30000, // ✅ 30 secondes
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        }
      }
    );

    const duration = Date.now() - startTime;
    console.log(`✅ [MonCash] Token obtenu en ${duration}ms`);

    if (!response.data.access_token) {
      throw new Error('Token MonCash vide dans la réponse');
    }

    return response.data.access_token;

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [MonCash] Erreur token après ${duration}ms:`, error.response?.data || error.message);
    
    if (error.code === 'ECONNABORTED') {
      throw new Error('Timeout: MonCash ne répond pas (30s dépassées)');
    }
    
    throw error;
  }
}

// ============================================
// ROUTE 1 : CRÉER UN PAIEMENT (timeout 45s)
// ============================================
app.post('/api/moncash/create-payment', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('📥 [CREATE-PAYMENT] Requête reçue:', {
      amount: req.body.amount,
      tokens: req.body.tokens,
      userId: req.body.userId?.substring(0, 8) + '...',
      userPseudo: req.body.userPseudo,
      mode: MONCASH_CONFIG.mode
    });

    const { amount, tokens, userId, userPseudo } = req.body;

    // Validation
    if (!amount || !tokens || !userId) {
      console.error('❌ [CREATE-PAYMENT] Paramètres manquants');
      return res.status(400).json({
        success: false,
        error: 'Paramètres manquants (amount, tokens, userId)'
      });
    }

    const amountInt = parseInt(amount, 10);
    if (isNaN(amountInt) || amountInt < 50) {
      return res.status(400).json({
        success: false,
        error: 'Montant invalide (minimum : 50 HTG)'
      });
    }

    // ⚠️ AVERTISSEMENT MODE LIVE
    if (MONCASH_CONFIG.mode === 'live' && amountInt > 10000) {
      console.warn('⚠️  [CREATE-PAYMENT] Montant élevé en mode LIVE:', amountInt);
    }

    if (!db) {
      throw new Error('Firebase non initialisé');
    }

    // Générer orderId unique
    const orderId = `TOKEN_${userId.substring(0, 8)}_${Date.now()}`;
    console.log('🆔 [CREATE-PAYMENT] OrderId:', orderId);

    // Étape 1: Obtenir token MonCash
    console.log('⏱️  [CREATE-PAYMENT] Étape 1/3: Récupération token...');
    const accessToken = await getMonCashToken();

    // Étape 2: Créer le paiement sur MonCash
    console.log('⏱️  [CREATE-PAYMENT] Étape 2/3: Création paiement MonCash...');
    console.log('📤 [MonCash] Données envoyées:', {
      amount: amountInt,
      orderId,
      baseUrl: MONCASH_CONFIG.baseUrl
    });

    const moncashResponse = await axios.post(
      `${MONCASH_CONFIG.baseUrl}/Api/v1/CreatePayment`,
      {
        amount: amountInt,
        orderId
      },
      {
        timeout: 45000, // ✅ 45 secondes pour CreatePayment
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      }
    );

    console.log('📊 [MonCash] Réponse complète:', JSON.stringify(moncashResponse.data, null, 2));

    const paymentToken = moncashResponse.data?.payment_token?.token;
    if (!paymentToken) {
      console.error('❌ [MonCash] Token paiement manquant. Réponse:', moncashResponse.data);
      throw new Error('Token paiement manquant dans la réponse MonCash');
    }

    console.log('✅ [MonCash] Payment token obtenu:', paymentToken.substring(0, 20) + '...');

    // Étape 3: Sauvegarder dans Firebase
    console.log('⏱️  [CREATE-PAYMENT] Étape 3/3: Sauvegarde Firebase...');
    
    // URL de callback pour retour MonCash
    const callbackUrl = `${process.env.BACKEND_URL}/api/moncash/callback?orderId=${orderId}`;
    console.log('🔗 [CREATE-PAYMENT] Callback URL:', callbackUrl);

    await db.ref(`pendingPayments/${orderId}`).set({
      userId,
      userPseudo: userPseudo || 'Utilisateur',
      amount: amountInt,
      tokens: parseInt(tokens, 10),
      status: 'pending',
      paymentToken,
      callbackUrl,
      mode: MONCASH_CONFIG.mode,
      createdAt: Date.now()
    });

    console.log('✅ [Firebase] Paiement enregistré');

    // URL de redirection vers MonCash
    const redirectUrl =
      `${MONCASH_CONFIG.baseUrl}/Moncash-middleware/Payment/Redirect` +
      `?token=${paymentToken}` +
      `&url=${encodeURIComponent(callbackUrl)}`;

    const duration = Date.now() - startTime;
    console.log(`✅ [CREATE-PAYMENT] Succès en ${duration}ms`);
    console.log('🔗 [CREATE-PAYMENT] URL de redirection générée');

    res.json({ 
      success: true, 
      redirectUrl, 
      orderId,
      mode: MONCASH_CONFIG.mode,
      duration: `${duration}ms`
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [CREATE-PAYMENT] Erreur après ${duration}ms:`, {
      message: error.message,
      response: error.response?.data,
      code: error.code
    });

    let userMessage = error.message;
    
    if (error.code === 'ECONNABORTED') {
      userMessage = 'Timeout: Le serveur MonCash ne répond pas. Réessayez dans quelques instants.';
    } else if (error.response?.status === 401) {
      userMessage = 'Erreur d\'authentification MonCash. Vérifiez les credentials.';
    } else if (error.response?.status >= 500) {
      userMessage = 'MonCash est temporairement indisponible. Réessayez plus tard.';
    }

    res.status(500).json({ 
      success: false, 
      error: userMessage,
      duration: `${duration}ms`,
      details: error.response?.data
    });
  }
});

// ============================================
// ROUTE 2 : CALLBACK MONCASH (✅ CORRIGÉE)
// ============================================
app.get('/api/moncash/callback', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('📥 [CALLBACK] URL complète:', req.url);
    console.log('📥 [CALLBACK] Query params:', req.query);
    console.log('📥 [CALLBACK] Body:', req.body);

    // ✅ CORRECTION : MonCash envoie SEULEMENT orderId, pas transactionId
    const orderId = req.query.orderId || req.query.orderid || req.query.order_id;

    if (!orderId) {
      console.error('❌ [CALLBACK] orderId manquant dans:', req.query);
      return res.send(generateErrorPage('Paramètres manquants dans le callback'));
    }

    console.log('🔑 [CALLBACK] OrderId détecté:', orderId);

    if (!db) {
      throw new Error('Firebase non initialisé');
    }

    const paymentRef = db.ref(`pendingPayments/${orderId}`);
    const snapshot = await paymentRef.once('value');

    if (!snapshot.exists()) {
      console.error('❌ [CALLBACK] Paiement introuvable:', orderId);
      return res.send(generateErrorPage('Paiement introuvable'));
    }

    const payment = snapshot.val();

    // ✅ Mettre à jour le statut en "callback_received"
    await paymentRef.update({
      status: 'callback_received',
      callbackReceivedAt: Date.now()
    });

    console.log('✅ [CALLBACK] Callback enregistré pour:', orderId);

    const duration = Date.now() - startTime;
    console.log(`✅ [CALLBACK] Traité en ${duration}ms`);

    // ✅ Page de succès avec auto-vérification
    res.send(generateSuccessPageWithVerification(orderId));

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [CALLBACK] Erreur après ${duration}ms:`, error.message);
    res.send(generateErrorPage(`Erreur serveur: ${error.message}`));
  }
});

// ============================================
// ROUTE 3 : VÉRIFIER LE PAIEMENT (✅ CORRIGÉE)
// ============================================
app.post('/api/moncash/verify-payment', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('📥 [VERIFY] Requête:', req.body);

    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ 
        success: false,
        error: 'orderId manquant' 
      });
    }

    if (!db) {
      throw new Error('Firebase non initialisé');
    }

    const paymentRef = db.ref(`pendingPayments/${orderId}`);
    const snapshot = await paymentRef.once('value');

    if (!snapshot.exists()) {
      console.log('⚠️  [VERIFY] Paiement introuvable:', orderId);
      return res.status(404).json({ 
        success: false,
        error: 'Paiement introuvable' 
      });
    }

    const payment = snapshot.val();
    
    // ✅ CORRECTION : Utiliser orderId au lieu de transactionId
    console.log('🔄 [VERIFY] Vérification MonCash avec orderId:', orderId);
    
    const accessToken = await getMonCashToken();
    
    // ✅ MonCash utilise orderId, pas transactionId
    const moncashResponse = await axios.get(
      `${MONCASH_CONFIG.baseUrl}/Api/v1/RetrieveOrderPayment`,
      {
        params: { orderId: orderId },
        timeout: 30000,
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      }
    );

    console.log('📊 [VERIFY] Réponse MonCash:', JSON.stringify(moncashResponse.data, null, 2));

    const paymentStatus = moncashResponse.data?.payment?.message;
    const transactionId = moncashResponse.data?.payment?.transaction_id;

    if (paymentStatus === 'successful') {
      console.log('✅ [VERIFY] Paiement confirmé! TransactionId:', transactionId);

      // Ajouter les jetons
      const userRef = db.ref(`users/${payment.userId}`);
      const userSnap = await userRef.once('value');
      const currentTokens = userSnap.val()?.tokens || 0;
      const newBalance = currentTokens + payment.tokens;

      await userRef.update({ tokens: newBalance });

      // Déplacer vers completedPayments
      await db.ref(`completedPayments/${orderId}`).set({
        ...payment,
        transactionId: transactionId,
        status: 'completed',
        completedAt: Date.now(),
        transactionData: moncashResponse.data
      });

      // Supprimer de pendingPayments
      await paymentRef.remove();

      const duration = Date.now() - startTime;
      console.log(`✅ [VERIFY] Succès en ${duration}ms. Jetons: ${payment.tokens}, Nouveau solde: ${newBalance}`);

      return res.json({ 
        success: true, 
        tokens: payment.tokens,
        newBalance,
        transactionId,
        duration: `${duration}ms`
      });
    }

    const duration = Date.now() - startTime;
    console.log(`⏳ [VERIFY] Statut: ${paymentStatus} après ${duration}ms`);

    res.json({ 
      success: false,
      status: paymentStatus || 'pending',
      message: 'Paiement pas encore confirmé'
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [VERIFY] Erreur après ${duration}ms:`, error.response?.data || error.message);
    
    res.status(500).json({ 
      success: false,
      error: error.message,
      duration: `${duration}ms`
    });
  }
});

// ============================================
// ROUTE SANTÉ
// ============================================
app.get('/api/health', (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    node: process.version,
    firebase: admin.apps.length ? 'Connected' : 'Not connected',
    moncash: MONCASH_CONFIG.clientId ? 'Configured' : 'Not configured',
    env: {
      backendUrl: process.env.BACKEND_URL || 'Not set',
      mode: MONCASH_CONFIG.mode,
      baseUrl: MONCASH_CONFIG.baseUrl
    }
  };

  console.log('🏥 [HEALTH] Check:', health);
  res.json(health);
});

// ============================================
// ROOT
// ============================================
app.get('/', (req, res) => {
  res.json({ 
    message: 'Backend MonCash Domino Ayiti 🚀',
    version: '2.2-FIXED',
    mode: MONCASH_CONFIG.mode,
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/moncash/create-payment',
      'GET /api/moncash/callback',
      'POST /api/moncash/verify-payment',
      'GET /api/health'
    ]
  });
});

// ============================================
// 404
// ============================================
app.use((req, res) => {
  console.log('⚠️  [404] Route non trouvée:', req.path);
  res.status(404).json({ 
    error: 'Route non trouvée',
    path: req.path 
  });
});

// ============================================
// FONCTIONS UTILITAIRES
// ============================================
function generateSuccessPage() {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Paiement reçu</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 500px;
          width: 100%;
          text-align: center;
        }
        h1 { 
          color: #27ae60; 
          font-size: 32px;
          margin-bottom: 16px;
        }
        p { 
          color: #555;
          font-size: 18px; 
          margin: 12px 0; 
        }
        .spinner {
          border: 4px solid #f3f3f3;
          border-top: 4px solid #27ae60;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          animation: spin 1s linear infinite;
          margin: 24px auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .icon { font-size: 64px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">✅</div>
        <h1>Paiement reçu!</h1>
        <p>Votre paiement a été reçu avec succès.</p>
        <div class="spinner"></div>
        <p style="font-size: 16px; color: #888;">Retour à l'application dans 3 secondes...</p>
      </div>
      <script>
        setTimeout(() => {
          window.location.href = 'https://glittery-buttercream-2cf125.netlify.app';
        }, 3000);
      </script>
    </body>
    </html>
  `;
}

// ✅ NOUVELLE FONCTION : Page avec auto-vérification
function generateSuccessPageWithVerification(orderId) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Vérification du paiement</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 500px;
          width: 100%;
          text-align: center;
        }
        h1 { 
          color: #27ae60; 
          font-size: 32px;
          margin-bottom: 16px;
        }
        p { 
          color: #555;
          font-size: 18px; 
          margin: 12px 0; 
        }
        .spinner {
          border: 4px solid #f3f3f3;
          border-top: 4px solid #27ae60;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          animation: spin 1s linear infinite;
          margin: 24px auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .icon { font-size: 64px; margin-bottom: 20px; }
        #status { font-size: 16px; color: #888; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">✅</div>
        <h1>Paiement reçu!</h1>
        <p>Vérification en cours...</p>
        <div class="spinner"></div>
        <p id="status">Veuillez patienter...</p>
      </div>
      <script>
        const BACKEND_URL = '${process.env.BACKEND_URL || 'http://localhost:5000'}';
        const ORDER_ID = '${orderId}';
        let attempts = 0;
        const MAX_ATTEMPTS = 10;

        async function verifyPayment() {
          attempts++;
          
          try {
            const response = await fetch(BACKEND_URL + '/api/moncash/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: ORDER_ID })
            });

            const data = await response.json();
            
            if (data.success) {
              document.querySelector('.icon').textContent = '🎉';
              document.querySelector('h1').textContent = 'Paiement confirmé!';
              document.querySelector('p').textContent = data.tokens + ' jetons ajoutés!';
              document.getElementById('status').textContent = 'Retour à l\\'application...';
              
              setTimeout(() => {
                window.location.href = 'https://glittery-buttercream-2cf125.netlify.app';
              }, 2000);
              
            } else if (attempts >= MAX_ATTEMPTS) {
              document.querySelector('.icon').textContent = '⏳';
              document.querySelector('h1').textContent = 'Vérification en cours';
              document.querySelector('p').textContent = 'Le paiement est en traitement.';
              document.getElementById('status').textContent = 'Vous pouvez revenir à l\\'application.';
              
              setTimeout(() => {
                window.location.href = 'https://glittery-buttercream-2cf125.netlify.app';
              }, 3000);
              
            } else {
              document.getElementById('status').textContent = 
                'Tentative ' + attempts + '/' + MAX_ATTEMPTS + '...';
              setTimeout(verifyPayment, 3000);
            }
            
          } catch (error) {
            console.error('Erreur vérification:', error);
            document.getElementById('status').textContent = 'Erreur de connexion. Retour...';
            
            setTimeout(() => {
              window.location.href = 'https://glittery-buttercream-2cf125.netlify.app';
            }, 3000);
          }
        }

        // Démarrer la vérification après 2 secondes
        setTimeout(verifyPayment, 2000);
      </script>
    </body>
    </html>
  `;
}

function generateErrorPage(message) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Erreur</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 500px;
          width: 100%;
          text-align: center;
        }
        h1 { 
          color: #e74c3c; 
          font-size: 32px;
          margin-bottom: 16px;
        }
        p { 
          color: #555;
          font-size: 16px; 
          margin: 12px 0; 
        }
        button {
          margin-top: 24px;
          padding: 12px 32px;
          background: #e74c3c;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.3s;
        }
        button:hover { background: #c0392b; }
        .icon { font-size: 64px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">❌</div>
        <h1>Erreur</h1>
        <p>${message}</p>
        <button onclick="window.location.href='https://glittery-buttercream-2cf125.netlify.app'">
          Retour à l'application
        </button>
      </div>
    </body>
    </html>
  `;
}

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`🚀 Backend MonCash Domino Ayiti - FIXED`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔗 URL: ${process.env.BACKEND_URL || `http://localhost:${PORT}`}`);
  console.log(`🌍 Mode: ${MONCASH_CONFIG.mode.toUpperCase()}`);
  console.log(`🔗 MonCash URL: ${MONCASH_CONFIG.baseUrl}`);
  console.log(`🔥 Firebase: ${admin.apps.length ? '✅ Connecté' : '❌ Non connecté'}`);
  console.log(`💰 MonCash: ${MONCASH_CONFIG.clientId ? '✅ Configuré' : '❌ Non configuré'}`);
  console.log(`⏱️  Timeouts:`);
  console.log(`   - getToken: 30s`);
  console.log(`   - createPayment: 45s`);
  console.log(`   - verifyPayment: 30s`);
  
  if (MONCASH_CONFIG.mode === 'live') {
    console.log('🚨 ========================================');
    console.log('🚨 ATTENTION: MODE PRODUCTION (LIVE)');
    console.log('🚨 Paiements réels activés!');
    console.log('🚨 ========================================');
  }
  
  console.log('='.repeat(60));
});

module.exports = app;