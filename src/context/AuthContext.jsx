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

        const userRef = doc(firestore, 'users', user.uid);
        let retryCount = 0;
        const maxRetries = 3; // ~5 seconds total
        let retryTimeout;

        const unsubscribeSnapshot = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();
            setAppUser({
              uid: user.uid,
              ...userData,
              billing: userData.billing || createDefaultBilling(),
            });
            setAppLoading(false);
            
            // Clear any pending retry timeout
            if (retryTimeout) {
              clearTimeout(retryTimeout);
            }
          } else {
            // Document doesn't exist yet - new user
            console.log("Waiting for user document to be created by backend...");
            
            // Implement retry mechanism for new users
            if (retryCount < maxRetries) {
              retryCount++;
              const delay = Math.min(retryCount * 200, 1000); // Exponential backoff
              retryTimeout = setTimeout(() => {
                // Force a re-check by unsubscribing and resubscribing
                unsubscribeSnapshot();
                const newUnsubscribe = onSnapshot(userRef, (docSnap) => {
                  if (docSnap.exists()) {
                    const userData = docSnap.data();
                    setAppUser({
                      uid: user.uid,
                      ...userData,
                      billing: userData.billing || createDefaultBilling(),
                    });
                    setAppLoading(false);
                  } else if (retryCount >= maxRetries) {
                    // After max retries, give up and let user proceed
                    console.warn("User document not found after retries, proceeding with empty state");
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
                });
                // Store the new unsubscribe function
                retryTimeout = newUnsubscribe;
              }, delay);
            } else {
              // Max retries reached, create minimal user state
              console.warn("Max retries reached for user document, creating minimal state");
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
          }
        }, (error) => {
          console.error("Error fetching user data:", error);
          setAppUser(null);
          setAppLoading(false);
        });

        return () => {
          unsubscribeSnapshot();
          if (retryTimeout && typeof retryTimeout === 'function') {
            retryTimeout();
          } else if (retryTimeout) {
            clearTimeout(retryTimeout);
          }
        };
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
