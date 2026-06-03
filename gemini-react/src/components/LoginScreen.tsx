import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';
import NemonIcon from './NemonIcon';
import { Shield, Sparkles, Zap } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Login failed:", err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setError("Não foi possível autenticar com o Google. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen w-full relative bg-[#09090b] overflow-hidden font-sans">
      {/* Background Decorative Glow Elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-600/10 blur-[120px] pointer-events-none"></div>
      
      {/* Futuristic Grid Lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none"></div>

      {/* Main Glassmorphic Login Card */}
      <div className="relative z-10 w-full max-w-[440px] mx-4 p-8 sm:p-10 rounded-[32px] border border-white/5 bg-[#0e0e11]/70 backdrop-blur-xl shadow-[0_24px_50px_-12px_rgba(0,0,0,0.7)] flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-700">
        
        {/* Pulsing Animated Icon Container */}
        <div className="relative flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-tr from-violet-600 to-indigo-600 p-[1px] shadow-[0_0_30px_rgba(124,58,237,0.3)] mb-6 group hover:scale-105 transition-transform duration-300">
          <div className="w-full h-full bg-[#0e0e11] rounded-[23px] flex items-center justify-center">
            <NemonIcon size={40} className="text-white" />
          </div>
          <div className="absolute -inset-1 rounded-[28px] bg-gradient-to-tr from-violet-600 to-indigo-600 opacity-20 blur-sm -z-10 group-hover:opacity-40 transition-opacity"></div>
        </div>

        {/* Title & Subtitle */}
        <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2 font-display bg-gradient-to-r from-white via-white to-white/70 bg-clip-text">
          Bem-vindo ao Nemon
        </h1>
        <p className="text-[14px] text-zinc-400 max-w-[320px] mb-8 font-normal leading-relaxed">
          Sua inteligência artificial integrada em tempo real. Faça login para sincronizar suas conversas, memórias e personalidades.
        </p>

        {/* Error Display */}
        {error && (
          <div className="w-full p-3.5 mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold text-left flex items-start gap-2.5 animate-in slide-in-from-top-2 duration-300">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0"></span>
            <span>{error}</span>
          </div>
        )}

        {/* Google Authentication Button */}
        <button
          disabled={loading}
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3.5 px-6 py-4 rounded-2xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 active:bg-white/5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer mb-8"
        >
          {loading ? (
            <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
              <g transform="matrix(1, 0, 0, 1, 0, 0)">
                <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.58h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.4c0,-0.66 -0.06,-1.29 -0.17,-1.88Z" fill="#4285F4" />
                <path d="M12,20.6c2.43,0 4.47,-0.8 5.96,-2.2l-3.3,-2.58c-0.92,0.62 -2.1,0.98 -3.3,0.98 -2.35,0 -4.33,-1.58 -5.04,-3.72H2.9v2.66c1.49,2.96 4.54,4.86 8.1,4.86Z" fill="#34A853" />
                <path d="M6.96,13.08c-0.18,-0.54 -0.28,-1.11 -0.28,-1.7s0.1,-1.16 0.28,-1.7V7.02H2.9c-0.6,1.2 -0.9,2.56 -0.9,3.98s0.3,2.78 0.9,3.98l4.06,-2.9Z" fill="#FBBC05" />
                <path d="M12,6.16c1.32,0 2.5,0.45 3.44,1.35l2.58,-2.58C16.46,3.46 14.43,2.6 12,2.6 8.44,2.6 5.39,4.5 3.9,7.46l4.06,2.9C8.67,7.74 10.65,6.16 12,6.16Z" fill="#EA4335" />
              </g>
            </svg>
          )}
          <span>{loading ? "Autenticando..." : "Entrar com o Google"}</span>
        </button>

        {/* Divider */}
        <div className="w-full flex items-center gap-3 mb-6">
          <div className="h-[1px] flex-1 bg-white/5"></div>
          <span className="text-[10px] uppercase font-bold text-zinc-600 tracking-widest shrink-0">Segurança Garantida</span>
          <div className="h-[1px] flex-1 bg-white/5"></div>
        </div>

        {/* Feature badges */}
        <div className="grid grid-cols-3 gap-3 w-full">
          <div className="flex flex-col items-center p-3 rounded-2xl bg-white/[0.02] border border-white/5">
            <Zap className="w-4 h-4 text-violet-400 mb-1" />
            <span className="text-[10px] font-semibold text-zinc-400">Tempo Real</span>
          </div>
          <div className="flex flex-col items-center p-3 rounded-2xl bg-white/[0.02] border border-white/5">
            <Sparkles className="w-4 h-4 text-emerald-400 mb-1" />
            <span className="text-[10px] font-semibold text-zinc-400">Multimodal</span>
          </div>
          <div className="flex flex-col items-center p-3 rounded-2xl bg-white/[0.02] border border-white/5">
            <Shield className="w-4 h-4 text-blue-400 mb-1" />
            <span className="text-[10px] font-semibold text-zinc-400">Dados Cloud</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LoginScreen;
