// js/main.js (REVISADO - Lógica de Autenticação Otimizada)

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig, motivationalQuotes } from './config.js';

// Inicialização do Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Estado da aplicação
let currentUser = null;

// Mapeamento dos ecrãs para fácil gestão
const screens = {
    login: document.getElementById('login-screen'),
    hub: document.getElementById('hub-screen'),
};

/**
 * Exibe um ecrã específico e esconde os outros.
 * @param {string} screenName O nome do ecrã a ser exibido ('login' ou 'hub').
 */
function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen?.classList.add('hidden'));
    screens[screenName]?.classList.remove('hidden');
}

/**
 * Observador do estado de autenticação.
 * Redireciona o utilizador com base no seu estado de login e dados no Firestore.
 */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                currentUser = { ...userDocSnap.data(), uid: user.uid };
                document.getElementById('hub-user-name').textContent = currentUser.nomeFantasia;
                showScreen('hub');
            } else {
                console.error("Dados do utilizador não encontrados no Firestore. A terminar sessão.");
                await signOut(auth); // Força o logout se os dados não existirem
            }
        } catch (error) {
            console.error("Erro ao obter dados do utilizador:", error);
            await signOut(auth);
        }
    } else {
        currentUser = null;
        showScreen('login');
    }
});

/**
 * Configura todos os event listeners da página quando o DOM estiver pronto.
 */
document.addEventListener('DOMContentLoaded', () => {
    setupAuthFormToggle();
    setupButtonActions();
    setupHubNavigation();
    showRandomQuote();
});

/**
 * Configura a alternância entre os formulários de login e registo.
 */
function setupAuthFormToggle() {
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
}

/**
 * Associa as funções de clique aos botões de ação (login, registo, logout).
 */
function setupButtonActions() {
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('signup-btn').addEventListener('click', handleSignup);
    document.getElementById('hub-logout-btn').addEventListener('click', () => signOut(auth));
}

/**
 * Configura a navegação para os diferentes módulos a partir do hub.
 */
function setupHubNavigation() {
    document.getElementById('hub-goto-rotina').addEventListener('click', () => {
        window.location.href = 'rotina-diaria.html';
    });
    document.getElementById('hub-goto-metas').addEventListener('click', () => {
        window.location.href = 'metas-e-produtos.html';
    });
    document.getElementById('hub-goto-olx').addEventListener('click', () => {
        window.location.href = 'olx-dashboard.html';
    });
    document.getElementById('hub-goto-ponto').addEventListener('click', () => {
        window.location.href = 'ponto/dashboard.html';
    });
}

/**
 * Manipula a tentativa de login do utilizador.
 */
async function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    
    // Validação inicial
    if (!username || !password) {
        showError(errorEl, 'Por favor, preencha todos os campos.');
        return;
    }
    
    hideError(errorEl);

    try {
        // Otimização: Primeiro, tentamos encontrar o utilizador pelo nome de fantasia
        const userQuery = query(collection(db, "users"), where("nomeFantasia_lower", "==", username.toLowerCase()));
        const querySnapshot = await getDocs(userQuery);

        if (querySnapshot.empty) {
            showError(errorEl, 'Utilizador não encontrado.');
            return;
        }

        const userData = querySnapshot.docs[0].data();
        
        // Agora, tentamos o login com o e-mail encontrado e a palavra-passe fornecida
        await signInWithEmailAndPassword(auth, userData.email, password);
        // O `onAuthStateChanged` tratará do redirecionamento para o hub
        
    } catch (error) {
        console.error("Erro de login:", error.code);
        // Trata o erro específico de palavra-passe incorreta
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            showError(errorEl, 'Palavra-passe incorreta.');
        } else {
            showError(errorEl, 'Ocorreu um erro ao tentar fazer login.');
        }
    }
}

/**
 * Manipula a tentativa de registo de um novo utilizador.
 */
async function handleSignup() {
    const nome = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const errorEl = document.getElementById('signup-error');

    // Validações
    if (!nome || !email || password.length < 6) {
        showError(errorEl, 'Preencha todos os campos. A palavra-passe deve ter no mínimo 6 caracteres.');
        return;
    }

    hideError(errorEl);

    try {
        // Verifica se o nome de fantasia já existe
        const nameQuery = query(collection(db, "users"), where("nomeFantasia_lower", "==", nome.toLowerCase()));
        const nameSnapshot = await getDocs(nameQuery);
        if (!nameSnapshot.empty) {
            showError(errorEl, 'Este nome de utilizador já está a ser utilizado.');
            return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Guarda os dados do novo utilizador no Firestore
        const userData = {
            uid: user.uid,
            email: email,
            nomeFantasia: nome,
            nomeFantasia_lower: nome.toLowerCase(),
            role: 'vendedor' // 'role' padrão para novos registos
        };
        await setDoc(doc(db, "users", user.uid), userData);
        // O `onAuthStateChanged` tratará de redirecionar o utilizador para o hub

    } catch (error) {
        console.error("Erro de registo:", error.code);
        if (error.code === 'auth/email-already-in-use') {
            showError(errorEl, 'Este e-mail já está em uso.');
        } else {
            showError(errorEl, 'Ocorreu um erro ao criar a conta.');
        }
    }
}

// --- Funções Utilitárias ---

/**
 * Exibe uma mensagem de erro num elemento específico.
 * @param {HTMLElement} element O elemento onde o erro será exibido.
 * @param {string} message A mensagem de erro.
 */
function showError(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
}

/**
 * Esconde o elemento de erro.
 * @param {HTMLElement} element O elemento de erro a esconder.
 */
function hideError(element) {
    element.textContent = '';
    element.classList.add('hidden');
}

/**
 * Exibe uma citação motivacional aleatória no topo da página.
 */
function showRandomQuote() {
    if (motivationalQuotes && motivationalQuotes.length > 0) {
        const randomIndex = Math.floor(Math.random() * motivationalQuotes.length);
        const { text, author } = motivationalQuotes[randomIndex];
        document.getElementById("quote-text").textContent = `"${text}"`;
        document.getElementById("quote-author").textContent = `— ${author}`;
    }
}