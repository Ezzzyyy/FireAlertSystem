import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAa43FeNlI9QZo7chKhXXAi4nR2-Cvz0A4",
  authDomain: "firealertsystem-46bc0.firebaseapp.com",
  projectId: "firealertsystem-46bc0",
  storageBucket: "firealertsystem-46bc0.firebasestorage.app",
  messagingSenderId: "444309973588",
  appId: "1:444309973588:web:a00587a93478d334449bc1",
  measurementId: "G-HZYKF52WWE"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export default app;