'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [userType, setUserType] = useState('patient');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get('type') === 'hospital') setUserType('hospital');
  }, [searchParams]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Create the user in Firebase
      await createUserWithEmailAndPassword(auth, email, password);
      
      // 2. Route them to the correct dashboard upon success
      if (userType === 'patient') {
        router.push('/scan');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      // Clean up Firebase error messages for the UI
      if (err.code === 'auth/email-already-in-use') {
        setError("This email is already registered. Please log in.");
      } else if (err.code === 'auth/weak-password') {
        setError("Password should be at least 6 characters.");
      } else {
        setError(err.message || "Failed to create account.");
      }
    } finally {
      setLoading(false);
    }
  };

  const isHospital = userType === 'hospital';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        
        <div className={`h-2 w-full ${isHospital ? 'bg-emerald-500' : 'bg-sky-500'}`}></div>
        
        <div className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-100 mb-2">
              {isHospital ? 'Register Hospital Admin' : 'Create Patient Profile'}
            </h1>
            <p className="text-sm text-slate-400">Join the Nidan-Live network.</p>
          </div>

          {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-500 text-red-200 text-sm rounded-lg text-center">{error}</div>}

          <form onSubmit={handleSignup} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Email Address</label>
              <input 
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Secure Password</label>
              <input 
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500"
                placeholder="Minimum 6 characters"
              />
            </div>

            <button 
              type="submit" disabled={loading}
              className={`w-full py-3 px-4 rounded-lg font-bold text-slate-900 transition-colors uppercase tracking-wide ${
                isHospital ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-sky-500 hover:bg-sky-400'
              } disabled:opacity-50`}
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-800 text-center">
            <p className="text-sm text-slate-400">
              Already have an account?{' '}
              <button onClick={() => router.push(`/login?type=${userType}`)} className="text-white hover:underline font-bold">
                Log In
              </button>
            </p>
          </div>
          
        </div>
      </div>
    </div>
  );
}