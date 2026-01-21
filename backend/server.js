// server.js - Backend Node.js pour gérer les paiements MonCash

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// MIDDLEWARE CORS - CORRECTION IMPORTANTE
// ============================================
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://glittery-buttercream-2cf125.netlify.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ============================================
// CONFIGURATION MONCASH
// ============================================
const MONCASH_CONFIG = {
  mode: 'sandbox', // 'sandbox' ou 'live'
  clientId: process.env.MONCASH_CLIENT_ID,
  clientSecret: process.env.MONCASH_CLIENT_SECRET,
  baseUrl: 'https://sandbox.moncashbutton.digicelgroup.com'
};

// 🔒 Sécurité
if (!MONCASH_CONFIG.clientId || !MONCASH_CONFIG.clientSecret) {
  console.error('❌ MONCASH_CLIENT_ID ou MONCASH_CLIENT_SECRET manquant');
}

if (!process.env.BACKEND_URL) {
  console.error('❌ BACKEND_URL manquant');
}

// ============================================
// CONFIGURATION FIREBASE ADMIN
// ============================================
if (
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY
) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    }),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`
  });
  console.log('✅ Firebase Admin initialisé');
} else {
  console.error('❌ Variables Firebase manquantes');
}

const db = admin.apps.length ? admin.database() : null;

// ============================================
// FONCTION : OBTENIR TOKEN MONCASH
// ============================================
async function getMonCashToken() {
  try {
    const auth = Buffer.from(
      `${MONCASH_CONFIG.clientId}:${MONCASH_CONFIG.clientSecret}`
    ).toString('base64');

    console.log('🔄 Demande token MonCash...');

    const response = await axios.post(
      `${MONCASH_CONFIG.baseUrl}/Api/oauth/token`,
      'scope=read,write&grant_type=client_credentials',
      {
        timeout: 15000,
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        }
      }
    );

    if (!response.data.access_token) {
      throw new Error('Token MonCash non reçu');
    }

    console.log('✅ Token MonCash obtenu');
    return response.data.access_token;

  } catch (error) {
    console.error('❌ Erreur getMonCashToken:', error.response?.data || error.message);
    throw error;
  }
}

// ============================================
// ROUTE 1 : CRÉER UN PAIEMENT
// ============================================
app.post('/api/moncash/create-payment', async (req, res) => {
  try {
    console.log('📥 Requête create-payment reçue:', req.body);

    const { amount, tokens, userId, userPseudo } = req.body;

    // Validation
    if (!amount || !tokens || !userId) {
      console.error('❌ Paramètres manquants');
      return res.status(400).json({
        success: false,
        error: 'Paramètres manquants (amount, tokens, userId)'
      });
    }

    const amountInt = parseInt(amount, 10);
    if (amountInt < 50) {
      return res.status(400).json({
        success: false,
        error: 'Montant minimum : 50 HTG'
      });
    }

    // Générer orderId unique
    const orderId = `TOKEN_${userId}_${Date.now()}`;
    console.log('🆔 OrderId généré:', orderId);

    // Obtenir token MonCash
    const accessToken = await getMonCashToken();

    // Créer le paiement sur MonCash
    console.log('🔄 Création paiement MonCash...');
    const response = await axios.post(
      `${MONCASH_CONFIG.baseUrl}/Api/v1/CreatePayment`,
      {
        amount: amountInt,
        orderId
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('📊 Réponse MonCash:', response.data);

    const paymentToken = response.data?.payment_token?.token;
    if (!paymentToken) {
      throw new Error('Token paiement manquant dans la réponse MonCash');
    }

    // URL de callback pour retour MonCash
    const callbackUrl = `${process.env.BACKEND_URL}/api/moncash/callback?orderId=${orderId}`;

    // URL de redirection vers MonCash
    const redirectUrl =
      `${MONCASH_CONFIG.baseUrl}/Moncash-middleware/Payment/Redirect` +
      `?token=${paymentToken}` +
      `&url=${encodeURIComponent(callbackUrl)}`;

    console.log('🔗 URL de redirection:', redirectUrl);

    // Sauvegarder dans Firebase
    await db.ref(`pendingPayments/${orderId}`).set({
      userId,
      userPseudo: userPseudo || 'Utilisateur',
      amount: amountInt,
      tokens: parseInt(tokens, 10),
      status: 'pending',
      paymentToken,
      createdAt: Date.now()
    });

    console.log('✅ Paiement enregistré dans Firebase');

    res.json({ 
      success: true, 
      redirectUrl, 
      orderId 
    });

  } catch (error) {
    console.error('❌ Erreur create-payment:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      error: error.response?.data?.message || error.message 
    });
  }
});

// ============================================
// ROUTE 2 : CALLBACK MONCASH
// ============================================
app.get('/api/moncash/callback', async (req, res) => {
  try {
    console.log('📥 Callback MonCash reçu:', req.query);

    const { transactionId, orderId } = req.query;

    if (!transactionId || !orderId) {
      console.error('❌ Callback: paramètres manquants');
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Erreur</title>
          <style>
            body { font-family: Arial; text-align: center; padding: 50px; }
            h1 { color: #e74c3c; }
          </style>
        </head>
        <body>
          <h1>❌ Erreur</h1>
          <p>Paramètres manquants dans le callback</p>
          <button onclick="window.close()">Fermer</button>
        </body>
        </html>
      `);
    }

    const paymentRef = db.ref(`pendingPayments/${orderId}`);
    const snapshot = await paymentRef.once('value');

    if (!snapshot.exists()) {
      console.error('❌ Paiement introuvable:', orderId);
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Erreur</title>
          <style>
            body { font-family: Arial; text-align: center; padding: 50px; }
            h1 { color: #e74c3c; }
          </style>
        </head>
        <body>
          <h1>❌ Erreur</h1>
          <p>Paiement introuvable</p>
          <button onclick="window.close()">Fermer</button>
        </body>
        </html>
      `);
    }

    // Mettre à jour le statut
    await paymentRef.update({
      transactionId,
      status: 'processing',
      callbackReceivedAt: Date.now()
    });

    console.log('✅ Callback enregistré, transactionId:', transactionId);

    // Page de succès avec redirection automatique
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Paiement reçu</title>
        <style>
          body { 
            font-family: Arial; 
            text-align: center; 
            padding: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            background: white;
            color: #333;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            max-width: 500px;
            margin: 0 auto;
          }
          h1 { color: #27ae60; margin-bottom: 20px; }
          p { font-size: 18px; margin: 15px 0; }
          .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #27ae60;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Paiement reçu!</h1>
          <p>Votre paiement a été reçu avec succès.</p>
          <div class="spinner"></div>
          <p>Retour à l'application dans 3 secondes...</p>
        </div>
        <script>
          setTimeout(() => {
            window.location.href = 'https://glittery-buttercream-2cf125.netlify.app';
          }, 3000);
        </script>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ Erreur callback:', error.message);
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Erreur</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 50px; }
          h1 { color: #e74c3c; }
        </style>
      </head>
      <body>
        <h1>❌ Erreur serveur</h1>
        <p>${error.message}</p>
        <button onclick="window.close()">Fermer</button>
      </body>
      </html>
    `);
  }
});

// ============================================
// ROUTE 3 : VÉRIFIER LE PAIEMENT
// ============================================
app.post('/api/moncash/verify-payment', async (req, res) => {
  try {
    console.log('📥 Requête verify-payment:', req.body);

    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ 
        success: false,
        error: 'orderId manquant' 
      });
    }

    const paymentRef = db.ref(`pendingPayments/${orderId}`);
    const snapshot = await paymentRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ 
        success: false,
        error: 'Paiement introuvable' 
      });
    }

    const payment = snapshot.val();
    
    if (!payment.transactionId) {
      console.log('⏳ Paiement en attente (pas de transactionId)');
      return res.json({ 
        success: false,
        status: 'pending',
        message: 'Paiement en cours de traitement' 
      });
    }

    // Vérifier le statut sur MonCash
    console.log('🔄 Vérification transactionId:', payment.transactionId);
    
    const accessToken = await getMonCashToken();
    const response = await axios.get(
      `${MONCASH_CONFIG.baseUrl}/Api/v1/RetrieveTransactionPayment`,
      {
        params: { transactionId: payment.transactionId },
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    console.log('📊 Statut MonCash:', response.data);

    if (response.data.payment.message === 'successful') {
      console.log('✅ Paiement confirmé, ajout des jetons...');

      // Ajouter les jetons à l'utilisateur
      const userRef = db.ref(`users/${payment.userId}`);
      const userSnap = await userRef.once('value');
      const currentTokens = userSnap.val()?.tokens || 0;
      const newBalance = currentTokens + payment.tokens;

      await userRef.update({ tokens: newBalance });

      // Déplacer vers completedPayments
      await db.ref(`completedPayments/${orderId}`).set({
        ...payment,
        status: 'completed',
        completedAt: Date.now(),
        transactionData: response.data
      });

      // Supprimer de pendingPayments
      await paymentRef.remove();

      console.log('✅ Jetons ajoutés:', payment.tokens, '| Nouveau solde:', newBalance);

      return res.json({ 
        success: true, 
        tokens: payment.tokens,
        newBalance
      });
    }

    // Paiement pas encore réussi
    res.json({ 
      success: false,
      status: response.data.payment.message,
      message: 'Paiement pas encore confirmé'
    });

  } catch (error) {
    console.error('❌ Erreur verify-payment:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ============================================
// ROUTE SANTÉ
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    node: process.version,
    firebase: admin.apps.length ? 'Connected' : 'Not connected',
    moncash: MONCASH_CONFIG.clientId ? 'Configured' : 'Not configured'
  });
});

// ============================================
// ROOT
// ============================================
app.get('/', (req, res) => {
  res.json({ 
    message: 'Backend MonCash opérationnel 🚀',
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
  res.status(404).json({ 
    error: 'Route non trouvée',
    path: req.path 
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`🚀 Backend MonCash lancé sur le port ${PORT}`);
  console.log(`🔗 URL: ${process.env.BACKEND_URL || `http://localhost:${PORT}`}`);
  console.log(`🌍 Mode: ${MONCASH_CONFIG.mode}`);
  console.log(`🔥 Firebase: ${admin.apps.length ? 'Connecté' : 'Non connecté'}`);
  console.log(`💰 MonCash: ${MONCASH_CONFIG.clientId ? 'Configuré' : 'Non configuré'}`);
  console.log('='.repeat(50));
});

module.exports = app;