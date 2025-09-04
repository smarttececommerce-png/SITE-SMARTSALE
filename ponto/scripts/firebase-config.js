// ponto/scripts/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCqJ3D_bv-8UmnwGAk2n8qKb_EMLofUfys",
    authDomain: "olx---ads-ops-dashboard.firebaseapp.com",
    projectId: "olx---ads-ops-dashboard",
    storageBucket: "olx---ads-ops-dashboard.appspot.com",
    messagingSenderId: "149455998150",
    appId: "1:149455998150:web:3074fba78ddd3367f65bc7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

 