'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const auth = getAuth(db.app);
const googleProvider = new GoogleAuthProvider();

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultRole = searchParams.get('role') || 'patient';

  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Male');

  const routeUser = (role: string) => {
    if (role === 'hospital') router.push('/dashboard/hospital');
    else router.push('/scan');
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (isLogin) {
        // LOGIN FLOW
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const userSnap = await getDoc(doc(db, 'users', userCredential.user.uid));
        const role = userSnap.exists() ? userSnap.data().role : defaultRole;
        routeUser(role);
      } else {
        // SIGN UP FLOW
        if (!name || !age) throw new Error("Please fill in all details.");
        
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await updateProfile(user, { displayName: name });

        // Save detailed profile to Firestore
        await setDoc(doc(db, 'users', user.uid), {
          name,
          email,
          role: defaultRole,
          age: parseInt(age),
          gender,
          createdAt: new Date(),
        });

        routeUser(defaultRole);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      let finalRole = defaultRole;

      if (!userSnap.exists()) {
        // Create basic profile for Google users
        await setDoc(userRef, {
          name: user.displayName,
          email: user.email,
          role: defaultRole,
          age: 'Not specified',
          gender: 'Not specified',
          createdAt: new Date(),
        });
      } else {
        finalRole = userSnap.data().role || 'patient';
      }
      routeUser(finalRole);
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset email sent! Check your inbox.');
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-slate-900/80 p-8 rounded-3xl shadow-2xl border border-slate-700 backdrop-blur-sm">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-br from-sky-400 to-emerald-400 items-center justify-center font-black text-slate-900 text-2xl shadow-[0_0_15px_rgba(56,189,248,0.5)] mb-4">
            N
          </div>
          <h2 className="text-2xl font-bold text-white">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Accessing as: <span className="text-sky-400 font-bold uppercase">{defaultRole}</span>
          </p>
        </div>

        {/* Alerts */}
        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm text-center">{error}</div>}
        {message && <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/50 rounded-lg text-emerald-400 text-sm text-center">{message}</div>}

        {/* Form */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          
          {!isLogin && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Full Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-sky-500 transition-colors" placeholder="John Doe" required={!isLogin} />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Age</label>
                  <input type="number" value={age} onChange={(e) => setAge(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-sky-500 transition-colors" placeholder="e.g. 35" required={!isLogin} />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Gender</label>
                  <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-sky-500 transition-colors">
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Email Address</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-sky-500 transition-colors" placeholder="you@example.com" required />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Password</label>
              {isLogin && (
                <button type="button" onClick={handleForgotPassword} className="text-xs text-sky-400 hover:text-sky-300">Forgot?</button>
              )}
            </div>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-sky-500 transition-colors" placeholder="••••••••" required />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-sky-500 hover:bg-sky-400 text-slate-900 font-bold py-3.5 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(56,189,248,0.3)] disabled:opacity-50 mt-2">
            {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="my-6 flex items-center justify-between">
          <span className="w-1/5 border-b border-slate-700 lg:w-1/4"></span>
          <span className="text-xs text-center text-slate-500 uppercase font-bold">Or continue with</span>
          <span className="w-1/5 border-b border-slate-700 lg:w-1/4"></span>
        </div>

        <button onClick={handleGoogleAuth} disabled={loading} className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-bold py-3 px-4 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50">
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
          Google
        </button>

        <p className="mt-8 text-center text-sm text-slate-400">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => {setIsLogin(!isLogin); setError(''); setMessage('');}} className="text-sky-400 hover:text-sky-300 font-bold underline decoration-sky-400/30 underline-offset-4">
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </p>

      </div>
    </div>
  );
}

// Wrap in Suspense to prevent Next.js build warnings with useSearchParams
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-sky-400">Loading Portal...</div>}>
      <LoginContent />
    </Suspense>
  );
}