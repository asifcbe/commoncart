import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const Ctx = createContext(null);

const icons = {
  success: <CheckCircle size={18} className="text-green-500 flex-shrink-0" />,
  error:   <XCircle    size={18} className="text-red-500 flex-shrink-0" />,
  warning: <AlertTriangle size={18} className="text-yellow-500 flex-shrink-0" />,
  info:    <Info       size={18} className="text-blue-500 flex-shrink-0" />,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback(({ message, type = 'info', duration = 4000 }) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), duration);
  }, []);

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 w-80 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="flex items-start gap-3 p-4 rounded-xl shadow-lg bg-white border text-sm pointer-events-auto">
            {icons[t.type]}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))} className="text-gray-400 hover:text-gray-600 mt-0.5">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
};
