import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCFj8AQGSxTeQx9CVP1aIA_w537zhbX_gw",
  authDomain: "hr-ab-a7348.firebaseapp.com",
  projectId: "hr-ab-a7348",
  storageBucket: "hr-ab-a7348.firebasestorage.app",
  messagingSenderId: "926378815417",
  appId: "1:926378815417:web:fff2f047cfee594b785068"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const ts = () => serverTimestamp();

export { app, auth, db, storage, ts };
