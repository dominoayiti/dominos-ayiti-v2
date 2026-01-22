// TokenRechargeModal.jsx - Composant mis à jour avec MonCash
import React, { useState, useEffect } from 'react';
import { Coins, X, Loader } from 'lucide-react';

// ============================================
// CONFIGURATION API - Changez l'URL selon votre serveur
// ============================================
const BACKEND_URL = 'https://dominos-ayiti-v2.onrender.com'; // URL de votre backend

const TokenRechargeModal = ({ onClose, currentTokens, userId, userPseudo }) => {
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Frais de service (10%)
  const SERVICE_FEE = 0.10;

  const rechargeOptions = [
    { tokens: 20, price: 100, currency: 'HTG' },
    { tokens: 100, price: 500, currency: 'HTG' },
    { tokens: 200, price: 1000, currency: 'HTG' },
    { tokens: 500, price: 2500, currency: 'HTG' },
    { tokens: 1000, price: 5000, currency: 'HTG' },
    { tokens: 2500, price: 12500, currency: 'HTG' },
    { tokens: 5000, price: 25000, currency: 'HTG' },
    { tokens: 10000, price: 50000, currency: 'HTG' },
    { tokens: 25000, price: 125000, currency: 'HTG' },
    { tokens: 50000, price: 250000, currency: 'HTG' }
  ];

  // Calculer le total avec frais
  const calculateTotal = (basePrice) => {
    const serviceFee = basePrice * SERVICE_FEE;
    const total = basePrice + serviceFee;
    return {
      basePrice,
      serviceFee,
      total
    };
  };

  // Gérer le paiement MonCash
  const handleMonCashPayment = async () => {
    if (!selectedAmount) {
      setErrorMessage('Tanpri chwazi yon kantite jeton!');
      return;
    }

    if (!userId || !userPseudo) {
      setErrorMessage('Enfòmasyon itilizatè manke. Tanpri konekte ankò.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const pricing = calculateTotal(selectedAmount.price);

      // Appeler le backend pour créer le paiement MonCash
      const response = await fetch(`${BACKEND_URL}/api/moncash/create-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: pricing.basePrice,
          tokens: selectedAmount.tokens,
          userId: userId,
          userPseudo: userPseudo
        })
      });

      const data = await response.json();

      if (data.success && data.redirectUrl) {
        // Sauvegarder l'orderId dans le localStorage pour vérification après retour
        localStorage.setItem('moncash_order_id', data.orderId);
        localStorage.setItem('moncash_tokens_expected', selectedAmount.tokens);

        setSuccessMessage('Redireksyon vè MonCash...');

        // Rediriger vers MonCash après 1 seconde
        setTimeout(() => {
          window.location.href = data.redirectUrl;
        }, 1000);
      } else {
        setErrorMessage(data.message || 'Erè pandan kreyasyon peman');
        setIsProcessing(false);
      }

    } catch (error) {
      console.error('Erreur MonCash:', error);
      setErrorMessage('Erè koneksyon ak sèvè. Tanpri eseye ankò.');
      setIsProcessing(false);
    }
  };

  // Vérifier si on revient d'un paiement MonCash
  useEffect(() => {
    const verifyPaymentOnReturn = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const transactionId = urlParams.get('transactionId');
      const orderId = localStorage.getItem('moncash_order_id');

      if (transactionId && orderId) {
        setIsProcessing(true);

        try {
          const response = await fetch(`${BACKEND_URL}/api/moncash/verify-payment`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              transactionId: transactionId,
              orderId: orderId
            })
          });

          const data = await response.json();

          if (data.success) {
            setSuccessMessage(`Siksè! ${data.tokensAdded} jetons ajoute. Nouvo balans: ${data.newBalance}`);
            
            // Nettoyer le localStorage
            localStorage.removeItem('moncash_order_id');
            localStorage.removeItem('moncash_tokens_expected');

            // Fermer la modale après 3 secondes
            setTimeout(() => {
              window.location.reload(); // Recharger la page pour mettre à jour les tokens
            }, 3000);
          } else {
            setErrorMessage('Peman pa konfime. Tanpri kontakte sipò.');
          }

        } catch (error) {
          console.error('Erreur vérification:', error);
          setErrorMessage('Erè pandan verifikasyon peman.');
        } finally {
          setIsProcessing(false);
        }
      }
    };

    verifyPaymentOnReturn();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Rechaje Jeton</h2>
              <div className="flex items-center text-white/90">
                <Coins className="w-5 h-5 mr-2" />
                <span>Balans Aktyèl: {currentTokens} jetons</span>
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
          {/* Messages */}
          {errorMessage && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded">
              <p className="text-sm text-red-800">{errorMessage}</p>
            </div>
          )}

          {successMessage && (
            <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-6 rounded">
              <p className="text-sm text-green-800">{successMessage}</p>
            </div>
          )}

          {/* Info Banner */}
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded">
            <p className="text-sm text-yellow-800">
              ⚠️ <strong>Nòt:</strong> Frè sèvis 10% ap ajoute nan tout rechaj. 
              Egzanp: Pou 500 HTG, w ap peye 550 HTG total.
            </p>
          </div>

          {/* Recharge Options */}
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Chwazi Kantite Jeton</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {rechargeOptions.map((option) => {
                const pricing = calculateTotal(option.price);
                return (
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
                    <div className="mt-2 border-t pt-2">
                      <p className="text-xs text-gray-500">Pri baz:</p>
                      <p className="text-green-600 font-semibold">{pricing.basePrice.toLocaleString()} HTG</p>
                      <p className="text-xs text-gray-500 mt-1">+ Frè (10%):</p>
                      <p className="text-orange-500 font-semibold">{pricing.serviceFee.toLocaleString()} HTG</p>
                      <p className="text-xs text-gray-700 font-bold mt-1 pt-1 border-t">Total:</p>
                      <p className="text-blue-600 font-bold text-lg">{pricing.total.toLocaleString()} HTG</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Amount Summary */}
          {selectedAmount && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <h4 className="font-bold text-blue-900 mb-3">Rezime Achay</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Jetons:</span>
                  <span className="font-bold text-gray-900">{selectedAmount.tokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Pri baz:</span>
                  <span className="font-semibold text-gray-900">{selectedAmount.price.toLocaleString()} HTG</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Frè sèvis (10%):</span>
                  <span className="font-semibold text-orange-500">
                    {calculateTotal(selectedAmount.price).serviceFee.toLocaleString()} HTG
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-blue-300">
                  <span className="font-bold text-blue-900">TOTAL:</span>
                  <span className="font-bold text-blue-900 text-lg">
                    {calculateTotal(selectedAmount.price).total.toLocaleString()} HTG
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* MonCash Payment Button */}
          <button
            onClick={handleMonCashPayment}
            disabled={!selectedAmount || isProcessing}
            className={`w-full p-5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white font-bold text-lg flex items-center justify-center gap-3 transition-all ${
              selectedAmount && !isProcessing
                ? 'hover:scale-105 hover:shadow-xl cursor-pointer' 
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader className="w-6 h-6 animate-spin" />
                <span>Tretman...</span>
              </>
            ) : (
              <>
                <span className="text-3xl">💰</span>
                <span>Peye ak MonCash</span>
              </>
            )}
          </button>

          {/* Info Footer */}
          <div className="mt-4 text-center text-xs text-gray-500">
            <p>Ou pral redirije vè MonCash pou finalye peman an</p>
            <p className="mt-1">Tout tranzaksyon an sekirite</p>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-full mt-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl transition-colors disabled:opacity-50"
          >
            Fèmen
          </button>
        </div>
      </div>
    </div>
  );
};

export default TokenRechargeModal;