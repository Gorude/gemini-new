import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBFE7bj7kPu8Ml4Zkl6dRwr_-2bo12hDmo",
  authDomain: "gemini-new-ced81.firebaseapp.com",
  projectId: "gemini-new-ced81",
  storageBucket: "gemini-new-ced81.firebasestorage.app",
  messagingSenderId: "520245461064",
  appId: "1:520245461064:web:664d6f5fc04e9b142f987d",
  measurementId: "G-90DGXM04H4"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export default app;
