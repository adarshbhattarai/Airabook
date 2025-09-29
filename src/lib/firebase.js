import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCz1b-k_pslC7ozEyQB-bCvChi7huOCTww",
  authDomain: "airaproject-f5298.firebaseapp.com",
  projectId: "airaproject-f5298",
  storageBucket: "airaproject-f5298.appspot.com",
  messagingSenderId: "877560373455",
  appId: "1:877560373455:web:f39b02a4cd707037a357ba",
  measurementId: "G-JBG33MH8KL"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const firestore = getFirestore(app);
