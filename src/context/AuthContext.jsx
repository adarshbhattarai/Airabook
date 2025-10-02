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
  const [loading, setLoading] = useState(true);
  const [appLoading, setAppLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setLoading(false);

      if (user) {
        setAppLoading(true);
        try {
          const userRef = doc(firestore, 'users', user.uid);
          const docSnap = await getDoc(userRef);

          if (docSnap.exists()) {
            setAppUser({ uid: user.uid, ...docSnap.data() });
          } else {
            // This is the key change.
          // If a user is authenticated but no Firestore doc exists, create it.
          const newUser = {
            displayName: user.displayName,
            email: user.email,
            accessibleBookIds: [],
          };
          await setDoc(userRef, newUser);
          console.log("Firestore document created for new user via auth listener.");
          setAppUser({ uid: user.uid, ...newUser });
          }
        } catch (error) {
            console.error("Error fetching user data:", error);
            setAppUser(null);
        }
        setAppLoading(false);
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

      const userRef = doc(firestore, 'users', user.uid);
      const docSnap = await getDoc(userRef);

      if (!docSnap.exists()) {
        const newUser = {
          displayName: user.displayName,
          email: user.email,
          accessibleBookIds: [],
        };
        await setDoc(userRef, newUser);
        console.log("Firestore document set successfully for new Google user.");
        setAppUser({ uid: user.uid, ...newUser });
      } else {
        setAppUser({ uid: user.uid, ...docSnap.data() });
      }
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
