import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, firestore } from '@/lib/firebase';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext();

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [appUser, setAppUser] = useState(null);
  const [loading, setLoading] = useState(true); // This still tracks Firebase auth loading
  const [appLoading, setAppLoading] = useState(true); // This tracks Firestore user data loading
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setLoading(false); // Firebase auth state is now known

      if (user) {
        // User is logged in, fetch their app-specific data from Firestore
        setAppLoading(true);
        try {
          const userRef = doc(firestore, 'users', user.uid);
          const docSnap = await getDoc(userRef);

          if (docSnap.exists()) {
            setAppUser({ uid: user.uid, ...docSnap.data() });
          } else {
            // This is a brand new user who hasn't had their Firestore doc created yet.
            setAppUser({ uid: user.uid, accessibleBookIds: [] });
          }
        } catch (error) {
            console.error("Error fetching user data:", error);
            // Set a default state even on error to avoid getting stuck
            setAppUser(null);
        }
        setAppLoading(false);
      } else {
        // User is logged out
        setAppUser(null);
        setAppLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signup = async (name, email, password) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName: name });

    // Create a corresponding user document in Firestore
    const userRef = doc(firestore, 'users', userCredential.user.uid);
    await setDoc(userRef, {
      displayName: name,
      email: email,
      accessibleBookIds: [],
    });
    
    await sendEmailVerification(userCredential.user);
    await userCredential.user.reload();
    setUser(userCredential.user);

    // Set app user immediately after signup
    setAppUser({
      uid: userCredential.user.uid,
      displayName: name,
      email: email,
      accessibleBookIds: [],
    });
  };

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    const userRef = doc(firestore, 'users', user.uid);
    const docSnap = await getDoc(userRef);

    if (!docSnap.exists()) {
      await setDoc(userRef, {
        displayName: user.displayName,
        email: user.email,
        accessibleBookIds: [],
      });
      setAppUser({
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        accessibleBookIds: [],
      });
    }
  };

  const logout = () => {
    return signOut(auth);
  };

  const resetPassword = (email) => {
    return sendPasswordResetEmail(auth, email);
  };

  const resendVerificationEmail = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    } else {
      throw new Error("No user is currently signed in.");
    }
  };

  const value = {
    user,
    appUser,
    loading,
    appLoading,
    signup,
    login,
    signInWithGoogle,
    logout,
    resetPassword,
    resendVerificationEmail,
  };

  // FIX: Always render children. The consuming components are responsible for showing loading states.
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
