import React, { useState, useEffect } from 'react';
import { Lock, Fingerprint, Shield, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface Props {
  isEnabled: boolean;
  correctPin?: string;
  biometricsEnabled?: boolean;
  onUnlock: () => void;
  onReset?: () => void;
}

export const SecurityLock: React.FC<Props> = ({ isEnabled, correctPin, biometricsEnabled, onUnlock, onReset }) => {
  const [pin, setPin] = useState('');
  const [isLocked, setIsLocked] = useState(isEnabled);
  const [error, setError] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    // Biometrics are disabled, only PIN acts as lock
  }, [isEnabled]);

  const handlePinSubmit = (digit: string) => {
    if (pin.length >= 4) return;
    
    const newPin = pin + digit;
    setPin(newPin);
    
    if (newPin.length === 4) {
      if (newPin === correctPin) {
        onUnlock();
        setIsLocked(false);
      } else {
        setError(true);
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 500);
        toast.error("Code PIN incorrect");
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
  };

  if (!isLocked) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-white dark:bg-gray-900 flex flex-col items-center justify-center p-6"
    >
      <div className="w-full max-w-xs flex flex-col items-center">
        <AnimatePresence mode="wait">
          {!showResetConfirm ? (
            <motion.div
              key="pin-entry"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full flex flex-col items-center"
            >
              <div className="mb-8 p-4 bg-brand-50 dark:bg-brand-900/30 rounded-full">
                <Shield size={48} className="text-brand-600 dark:text-brand-400" />
              </div>
              
              <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Application Verrouillée</h2>
              <p className="text-gray-500 dark:text-gray-400 text-center mb-12 text-sm">
                Veuillez entrer votre code PIN pour accéder à DashMeals
              </p>

              {/* PIN Display */}
              <div className={`flex space-x-4 mb-12 ${error ? 'animate-shake' : ''}`}>
                {[0, 1, 2, 3].map((i) => (
                  <div 
                    key={i}
                    className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                      pin.length > i 
                      ? 'bg-brand-600 border-brand-600 scale-110' 
                      : 'border-gray-300 dark:border-gray-600'
                    }`}
                  />
                ))}
              </div>

              {/* Keypad */}
              <div className="grid grid-cols-3 gap-6 w-full">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    onClick={() => handlePinSubmit(num.toString())}
                    className="w-16 h-16 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-xl font-bold text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-all"
                  >
                    {num}
                  </button>
                ))}
                <div className="w-16 h-16" />
                <button
                  onClick={() => handlePinSubmit('0')}
                  className="w-16 h-16 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-xl font-bold text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-all"
                >
                  0
                </button>
                <button
                  onClick={handleBackspace}
                  className="w-16 h-16 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400"
                >
                  <X size={24} />
                </button>
              </div>

              <button 
                onClick={() => setShowResetConfirm(true)}
                className="mt-12 text-sm font-bold text-brand-600 dark:text-brand-400 hover:underline"
              >
                Code PIN oublié ?
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="reset-confirm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full flex flex-col items-center text-center"
            >
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 rounded-full">
                <Lock size={48} className="text-red-600 dark:text-red-400" />
              </div>
              
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-3">Réinitialiser le PIN ?</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm leading-relaxed">
                Par mesure de sécurité, la réinitialisation de votre code PIN requiert une deconnexion. Vous devrez ensuite vous reconnecter avec vos identifiants pour en définir un nouveau.
              </p>

              <div className="w-full space-y-3">
                <button
                  onClick={onReset}
                  className="w-full py-3.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl active:scale-[0.98] transition-all text-sm shadow-md shadow-brand-600/10"
                >
                  Me déconnecter et réinitialiser
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="w-full py-3.5 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl active:scale-[0.98] transition-all text-sm"
                >
                  Retour
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
