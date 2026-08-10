import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import useCustomerStore from '../store/useCustomerStore';
import { useToast } from '../components/ui/Toast';
import shopConfig from '../config/shop.config';
import Spinner from '../components/ui/Spinner';
import { applyMeta } from '../utils/theme';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, register, customer } = useCustomerStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  useEffect(() => {
    applyMeta(isLogin ? 'Sign In' : 'Create Account');
    if (customer) navigate(redirect, { replace: true });
  }, [customer, isLogin]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await login(form.email.trim(), form.password);
      } else {
        await register(form.name.trim(), form.email.trim(), form.password, form.phone);
        toast({ message: 'Account created! Welcome.', type: 'success' });
      }
      navigate(redirect, { replace: true });
    } catch (err) {
      toast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="card p-8">
          {/* Brand */}
          <div className="text-center mb-8">
            {shopConfig.brand.logoUrl ? (
              <img src={shopConfig.brand.logoUrl} alt={shopConfig.brand.logoAltText} className="h-10 mx-auto mb-3" />
            ) : (
              <div
                className="h-12 w-12 rounded-xl text-white font-bold text-lg flex items-center justify-center mx-auto mb-3"
                style={{ background: 'var(--color-primary)' }}
              >
                {shopConfig.brand.shortName}
              </div>
            )}
            <h1 className="text-xl font-bold text-gray-900">
              {isLogin ? 'Welcome back' : `Join ${shopConfig.brand.name}`}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {isLogin ? 'Sign in to your account' : 'Create your free account'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                <input className="input" value={form.name} onChange={set('name')} required placeholder="John Doe" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
              <input type="email" className="input" value={form.email} onChange={set('email')} required placeholder="you@example.com" autoFocus={isLogin} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input pr-10"
                  value={form.password}
                  onChange={set('password')}
                  required
                  minLength={6}
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" tabIndex={-1}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {!isLogin && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone (optional)</label>
                <input className="input" value={form.phone} onChange={set('phone')} placeholder="+1 555 000 0000" />
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 rounded-xl mt-2"
            >
              {loading ? <Spinner size="sm" /> : isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-5 text-center text-sm">
            {isLogin ? (
              <>Don't have an account?{' '}
                <button onClick={() => setIsLogin(false)} className="font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}>
                  Sign Up
                </button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button onClick={() => setIsLogin(true)} className="font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}>
                  Sign In
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
