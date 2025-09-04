// js/main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';
import { initSmartSale } from './smartsale-module.js';
import { motivationalQuotes } from "./config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;

const screens = {
    login: document.getElementById('login-screen'),
    hub: document.getElementById('hub-screen'),
    smartsale: document.getElementById('smartsale-screen'),
};

function showScreen(screenName) {
    Object.values(screens).forEach(screen => {
        if (screen) screen.classList.add('hidden');
    });
    if (screens[screenName]) {
        screens[screenName].classList.remove('hidden');
    }
}

// --- Autenticação ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            // CORREÇÃO: Garante que o UID do usuário autenticado esteja sempre presente no objeto currentUser.
            currentUser = { ...userDocSnap.data(), uid: user.uid };
            document.getElementById('hub-user-name').textContent = currentUser.nomeFantasia;
            showScreen('hub');
        } else {
            console.error("User data not found in Firestore. Logging out.");
            signOut(auth);
        }
    } else {
        currentUser = null;
        showScreen('login');
    }
});

// --- Lógica de Navegação do Hub ---
document.addEventListener('DOMContentLoaded', () => {
    // Links para alternar entre Login e Registo
    const showSignupLink = document.getElementById('show-signup-link');
    const showLoginLink = document.getElementById('show-login-link');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');

    showSignupLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });

    // Ações dos botões
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('signup-btn').addEventListener('click', handleSignup);
    document.getElementById('hub-logout-btn').addEventListener('click', () => signOut(auth));

    // Ações dos Cards do Hub
    document.getElementById('hub-goto-smartsale').addEventListener('click', () => {
        if (currentUser) {
            showScreen('smartsale');
            // Passa a instância 'db' diretamente para o módulo
            initSmartSale(db, currentUser, showScreen);
        } else {
            alert("Por favor, aguarde o carregamento dos dados do utilizador.");
        }
    });

    document.getElementById('hub-goto-olx').addEventListener('click', () => {
        window.location.href = 'olx-dashboard.html';
    });

    document.getElementById('hub-goto-ponto').addEventListener('click', () => {
        window.location.href = 'ponto/dashboard.html';
    });
});
 
// frase aleatoria
function showRandomQuote() {
    const randomIndex = Math.floor(Math.random() * motivationalQuotes.length);
    const { text, author } = motivationalQuotes[randomIndex];

    document.getElementById("quote-text").textContent = `"${text}"`;
    document.getElementById("quote-author").textContent = `— ${author}`;
}

// Chama quando a página carrega
document.addEventListener("DOMContentLoaded", showRandomQuote);


// --- Funções de Login e Registo ---
async function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';
    errorEl.classList.add('hidden');

    if (!username || !password) {
        errorEl.textContent = 'Por favor, preencha todos os campos.';
        errorEl.classList.remove('hidden');
        return;
    }

    const userQuery = query(collection(db, "users"), where("nomeFantasia_lower", "==", username.toLowerCase()));
    const querySnapshot = await getDocs(userQuery);

    if (querySnapshot.empty) {
        errorEl.textContent = 'Utilizador não encontrado.';
        errorEl.classList.remove('hidden');
        return;
    }

    const userData = querySnapshot.docs[0].data();

    try {
        await signInWithEmailAndPassword(auth, userData.email, password);
    } catch (error) {
        console.error("Login error:", error);
        errorEl.textContent = 'Senha incorreta.';
        errorEl.classList.remove('hidden');
    }
}

async function handleSignup() {
    const nome = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const errorEl = document.getElementById('signup-error');
    errorEl.textContent = '';
    errorEl.classList.add('hidden');

    if (!nome || !email || !password) {
        errorEl.textContent = 'Por favor, preencha todos os campos.';
        errorEl.classList.remove('hidden');
        return;
    }
    if (password.length < 6) {
        errorEl.textContent = 'A senha deve ter pelo menos 6 caracteres.';
        errorEl.classList.remove('hidden');
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: email,
            nomeFantasia: nome,
            nomeFantasia_lower: nome.toLowerCase(),
            role: 'vendedor' // 'role' padrão para novos registos
        });
        // O onAuthStateChanged irá tratar de redirecionar o utilizador para o hub.

    } catch (error) {
        console.error("Signup error:", error);
        if (error.code === 'auth/email-already-in-use') {
            errorEl.textContent = 'Este email já está em uso.';
        } else {
            errorEl.textContent = 'Erro ao criar a conta.';
        }
        errorEl.classList.remove('hidden');
    }
}