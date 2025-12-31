
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// TODO: Replace the following with your app's Firebase project configuration
// See: https://console.firebase.google.com/
const firebaseConfig = {
  apiKey: "AIzaSyAS-gTfDA92vwy0Kuns2-iEOZ521s3WHoE",
  authDomain: "djsnacks-5d935.firebaseapp.com",
  databaseURL: "https://djsnacks-5d935-default-rtdb.firebaseio.com",
  projectId: "djsnacks-5d935",
  storageBucket: "djsnacks-5d935.firebasestorage.app",
  messagingSenderId: "91255206676",
  appId: "1:91255206676:web:72c639351a62b01db80801"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
