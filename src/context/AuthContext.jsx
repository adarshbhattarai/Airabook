import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  updateEmail,
  updatePassword,
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
      console.log('🔐 Auth State Changed:', user ? `User ${user.uid}` : 'No User');
      setUser(user);
      setLoading(false);

      if (user) {
        console.log('👤 Fetching user data for:', user.uid);
        setAppLoading(true);

        const userRef = doc(firestore, 'users', user.uid);
        console.log('🔗 Setting up snapshot listener for:', userRef.path);

        // Simple snapshot listener - it will automatically detect when the doc is created
        const unsubscribeSnapshot = onSnapshot(userRef,
          (docSnap) => {
            console.log('📄 User Snapshot update:', { exists: docSnap.exists(), id: docSnap.id });

            if (docSnap.exists()) {
              const userData = docSnap.data();
              console.log('✅ User data found:', userData);
              setAppUser({
                uid: user.uid,
                ...userData,
                billing: userData.billing || createDefaultBilling(),
              });
              setAppLoading(false);
            } else {
              // Document doesn't exist yet - just wait, the snapshot will update when it's created
              console.log("⏳ Waiting for user document to be created by backend trigger...");
              // Don't set appLoading to false yet - keep waiting for the trigger
            }
          },
          (error) => {
            console.error("❌ Error in snapshot listener:", error);
            // On error, create minimal user state so app doesn't hang
            console.warn("⚠️ Creating minimal user state due to error");
            setAppUser({
              uid: user.uid,
              accessibleBookIds: [],
              accessibleAlbums: [],
              billing: createDefaultBilling(),
              displayName: user.displayName || '',
              email: user.email || '',
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            setAppLoading(false);
          }
        );

        return () => {
          console.log('🧹 Cleaning up user snapshot listener');
          unsubscribeSnapshot();
        };
      } else {
        console.log('👋 User logged out or no session, clearing appUser');
        setAppUser(null);
        setAppLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signup = async (name, email, password) => {
    try {
      console.log("🚀 Starting signup process...");

      // Create user with Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: name });

      // Send verification email
      await sendEmailVerification(userCredential.user);
      console.log("📧 Verification email sent to:", email);

      console.log("✅ Signup successful, user created:", userCredential.user.uid);
      console.log("⏳ Waiting for backend trigger to create Firestore document...");

      // The onAuthStateChanged listener will handle the rest
      // It has retry logic to wait for the backend trigger to finish

    } catch (error) {
      console.error("❌ Error during signup:", error);
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

  const updateUserProfile = async ({ displayName, email, photoURL }) => {
    if (!auth.currentUser) {
      throw new Error('No user is currently signed in.');
    }

    const profileUpdates = {};

    if (displayName && displayName !== auth.currentUser.displayName) {
      profileUpdates.displayName = displayName;
    }

    if (photoURL && photoURL !== auth.currentUser.photoURL) {
      profileUpdates.photoURL = photoURL;
    }

    if (Object.keys(profileUpdates).length > 0) {
      await updateProfile(auth.currentUser, profileUpdates);
    }

    if (email && email !== auth.currentUser.email) {
      await updateEmail(auth.currentUser, email);
    }

    const userRef = doc(firestore, 'users', auth.currentUser.uid);

    await setDoc(
      userRef,
      {
        displayName: displayName || auth.currentUser.displayName || '',
        email: email || auth.currentUser.email || '',
        photoURL: photoURL || auth.currentUser.photoURL || '',
        updatedAt: new Date(),
      },
      { merge: true },
    );
  };

  const changePassword = async (newPassword) => {
    if (!auth.currentUser) {
      throw new Error('No user is currently signed in.');
    }

    await updatePassword(auth.currentUser, newPassword);
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
    updateUserProfile,
    changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
