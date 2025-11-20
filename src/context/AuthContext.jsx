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
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, firestore } from '@/lib/firebase';
import { useToast } from '@/components/ui/use-toast';

const defaultEntitlements = {
  canReadBooks: true,
  canWriteBooks: true, // Free for everyone!
  canInviteTeam: false,
};

const createDefaultBilling = () => ({
  planTier: 'free',
  planLabel: 'Free Explorer',
  planState: 'inactive',
  entitlements: { ...defaultEntitlements },
  latestPaymentId: null,
});

const defaultBilling = createDefaultBilling();

const AuthContext = createContext();

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [appUser, setAppUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [appLoading, setAppLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);

      if (user) {
        setAppLoading(true);

        // Subscribe to the user document
        // This handles the race condition: if the doc doesn't exist yet (backend is creating it),
        // we wait. When it's created, this listener will fire with the data.
        const userRef = doc(firestore, 'users', user.uid);
        const unsubscribeSnapshot = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();
            setAppUser({
              uid: user.uid,
              ...userData,
              billing: userData.billing || createDefaultBilling(),
            });
            setAppLoading(false);
          } else {
            // Document doesn't exist yet.
            // If it's a new signup, the backend function is likely still running.
            // We keep appLoading = true so the UI waits.
            console.log("Waiting for user document to be created by backend...");
          }
        }, (error) => {
          console.error("Error fetching user data:", error);
          setAppUser(null);
          setAppLoading(false);
        });

        return () => unsubscribeSnapshot();
      } else {
        setAppUser(null);
        setAppLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signup = async (name, email, password) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: name });

      console.log("Signup successful, waiting for auth listener to set doc.");
      setUser(userCredential.user);

    } catch (error) {
      console.log("Error during signup:", error)
      console.error("Error during signup:", error);
      toast({
        title: "Signup Failed",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Backend handles user creation via triggers.
      // We just wait for the auth state listener to pick up the new user doc.
      console.log("Google Sign-In successful for:", user.uid);
    } catch (error) {
      console.error("Error during Google sign-in:", error);
      toast({
        title: "Google Sign-In Failed",
        description: error.message,
        variant: "destructive",
      });
      throw error;
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

  const billing = appUser?.billing || createDefaultBilling();
  const value = {
    user,
    appUser,
    billing,
    entitlements: billing.entitlements || defaultBilling.entitlements,
    loading,
    appLoading,
    signup,
    login,
    signInWithGoogle,
    logout,
    resetPassword,
    resendVerificationEmail,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
