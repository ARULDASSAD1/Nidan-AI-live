// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Replace this with your actual Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyA1LZyH4wTT05GIvzQWM5TWaB2EpQaYJ-I",
  authDomain: "nidan-ai.firebaseapp.com",
  projectId: "nidan-ai",
  storageBucket: "nidan-ai.firebasestorage.app",
  messagingSenderId: "84242857194",
  aappId: "1:84242857194:web:a8bab905cc878b11e3ab93",
  measurementId: "G-84BEV47LLE"
};

// Initialize Firebase only once
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };