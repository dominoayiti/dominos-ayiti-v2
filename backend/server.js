// server.js - Backend Node.js pour gérer les paiements MonCash

require('dotenv').config(); // OK en local, ignoré sur Render

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
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

// 🔒 Sécurité (NE PAS CRASH RENDER)
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
  const auth = Buffer.from(
    `${MONCASH_CONFIG.clientId}:${MONCASH_CONFIG.clientSecret}`
  ).toString('base64');

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

  return response.data.access_token;
}

// ============================================
// ROUTE 1 : CRÉER UN PAIEMENT
// ============================================
app.post('/api/moncash/create-payment', async (req, res) => {
  try {
    const { amount, tokens, userId, userPseudo } = req.body;

    if (!amount || !tokens || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Paramètres manquants'
      });
    }

    if (parseInt(amount, 10) < 50) {
      return res.status(400).json({
        success: false,
        error: 'Montant minimum : 50 HTG'
      });
    }

    const orderId = `TOKEN_${userId}_${Date.now()}`;
    const accessToken = await getMonCashToken();

    const response = await axios.post(
      `${MONCASH_CONFIG.baseUrl}/Api/v1/CreatePayment`,
      {
        amount: parseInt(amount, 10),
        orderId
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const paymentToken = response.data?.payment_token?.token;
    if (!paymentToken) throw new Error('Token paiement manquant');

    const callbackUrl = `${process.env.BACKEND_URL}/api/moncash/callback?orderId=${orderId}`;

    const redirectUrl =
      `${MONCASH_CONFIG.baseUrl}/Moncash-middleware/Payment/Redirect` +
      `?token=${paymentToken}&url=${encodeURIComponent(callbackUrl)}`;

    await db.ref(`pendingPayments/${orderId}`).set({
      userId,
      userPseudo: userPseudo || 'Utilisateur',
      amount: parseInt(amount, 10),
      tokens: parseInt(tokens, 10),
      status: 'pending',
      createdAt: Date.now()
    });

    res.json({ success: true, redirectUrl, orderId });

  } catch (error) {
    console.error('❌ create-payment:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE 2 : CALLBACK MONCASH
// ============================================
app.get('/api/moncash/callback', async (req, res) => {
  try {
    const { transactionId, orderId } = req.query;

    if (!transactionId || !orderId) {
      return res.send('<h1>❌ Paramètres manquants</h1>');
    }

    const paymentRef = db.ref(`pendingPayments/${orderId}`);
    const snapshot = await paymentRef.once('value');

    if (!snapshot.exists()) {
      return res.send('<h1>❌ Paiement introuvable</h1>');
    }

    await paymentRef.update({
      transactionId,
      status: 'processing',
      callbackReceivedAt: Date.now()
    });

    res.send('<h1>✅ Paiement reçu, retournez à l’application</h1>');

  } catch (error) {
    console.error('❌ callback:', error.message);
    res.send('<h1>❌ Erreur serveur</h1>');
  }
});

// ============================================
// ROUTE 3 : VÉRIFIER LE PAIEMENT
// ============================================
app.post('/api/moncash/verify-payment', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId manquant' });

    const paymentRef = db.ref(`pendingPayments/${orderId}`);
    const snapshot = await paymentRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Paiement introuvable' });
    }

    const payment = snapshot.val();
    if (!payment.transactionId) {
      return res.json({ status: 'pending' });
    }

    const accessToken = await getMonCashToken();
    const response = await axios.get(
      `${MONCASH_CONFIG.baseUrl}/Api/v1/RetrieveTransactionPayment`,
      {
        params: { transactionId: payment.transactionId },
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (response.data.payment.message === 'successful') {
      const userRef = db.ref(`users/${payment.userId}`);
      const userSnap = await userRef.once('value');
      const current = userSnap.val()?.tokens || 0;

      await userRef.update({ tokens: current + payment.tokens });

      await db.ref(`completedPayments/${orderId}`).set({
        ...payment,
        status: 'completed',
        completedAt: Date.now()
      });

      await paymentRef.remove();

      return res.json({ success: true, tokens: payment.tokens });
    }

    res.json({ status: response.data.payment.message });

  } catch (error) {
    console.error('❌ verify-payment:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ROUTE SANTÉ
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    node: process.version,
    firebase: admin.apps.length ? 'Connected' : 'Not connected'
  });
});

// ============================================
// ROOT
// ============================================
app.get('/', (req, res) => {
  res.json({ message: 'Backend MonCash opérationnel 🚀' });
});

// ============================================
// 404
// ============================================
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Backend MonCash lancé sur le port ${PORT}`);
  console.log(`🔗 ${process.env.BACKEND_URL || 'local'}`);
});

module.exports = app;
