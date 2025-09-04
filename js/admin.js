// js/admin.js (Controlador Principal)

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, onSnapshot, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';

// Inicialização do Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- VARIÁVEIS GLOBAIS COMPARTILHADAS ---
// Estes arrays armazenam os dados que serão passados para os módulos
let allUsers = [];
let allPontoRecords = [];
let allTasks = [];
let allAbsences = [];
let pontoConfig = {};

// --- INICIALIZAÇÃO ---

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists() && userDocSnap.data().role === 'admin') {
            initializeAppPanel();
        } else {
            // Se o usuário não for admin, volta para o hub principal
            window.location.href = 'index.html';
        }
    } else {
        // Se não estiver logado, volta para o login
        window.location.href = 'index.html';
    }
});

function initializeAppPanel() {
    console.log("Painel de Administração Central inicializado.");
    document.getElementById('logoutButton')?.addEventListener('click', () => signOut(auth));
    loadSharedDataListeners();
    setupNavigation();
}

// Carrega dados que podem ser usados por múltiplos módulos em tempo real
function loadSharedDataListeners() {
    onSnapshot(query(collection(db, "users")), (snap) => {
        allUsers = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        // Dispara um evento personalizado para notificar os módulos que os usuários foram atualizados
        window.dispatchEvent(new CustomEvent('usersUpdated'));
    });
    
    onSnapshot(query(collection(db, "registrosPonto")), (snap) => {
        allPontoRecords = snap.docs.map(doc => doc.data());
        // Atualiza a Visão Geral
        updateWorkingNowPanel();
        // Notifica os módulos
        window.dispatchEvent(new CustomEvent('pontoRecordsUpdated'));
    });
    
    onSnapshot(query(collection(db, "tasks")), (snap) => {
        allTasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Notifica os módulos
        window.dispatchEvent(new CustomEvent('tasksUpdated'));
    });
    
     onSnapshot(query(collection(db, "ausencias")), (snap) => {
        allAbsences = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
         // Notifica os módulos
        window.dispatchEvent(new CustomEvent('absencesUpdated'));
    });
    
    getDoc(doc(db, "configuracaoPonto", "default")).then(docSnap => {
        if(docSnap.exists()) pontoConfig = docSnap.data();
    });
}

// --- NAVEGAÇÃO E CARREGAMENTO DE MÓDULOS ---

async function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.admin-section');
    const loadedModules = new Set(); // Evita carregar o mesmo módulo múltiplas vezes

    const activateTab = async (targetId) => {
        // Mostra a seção correta no HTML
        sections.forEach(section => {
            section.style.display = section.id === targetId ? 'block' : 'none';
        });

        // Carrega o módulo JS correspondente se ainda não foi carregado
        if (!loadedModules.has(targetId)) {
            try {
                switch (targetId) {
                    case 'ponto':
                        const { initPontoAdmin } = await import('./admin/ponto.js');
                        // Passa o 'db' e funções para obter os dados mais recentes
                        initPontoAdmin(db, () => allUsers, () => allPontoRecords, () => allAbsences, () => pontoConfig);
                        break;
                    case 'usuarios':
                        const { initUsuariosAdmin } = await import('./admin/usuarios.js');
                        initUsuariosAdmin(db, () => allUsers);
                        break;
                    // Futuramente, outros módulos podem ser adicionados aqui
                    // case 'smartsale':
                    //     const { initSmartSaleAdmin } = await import('./admin/smartsale.js');
                    //     initSmartSaleAdmin(db, () => allUsers, () => allTasks);
                    //     break;
                }
                loadedModules.add(targetId);
            } catch (error) {
                console.error(`Erro ao carregar o módulo para a aba '${targetId}':`, error);
            }
        }
    };

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            activateTab(targetId);
        });
    });

    // Ativa a primeira aba ("Visão Geral") por padrão
    const initialLink = document.querySelector('.nav-link[href="#geral"]');
    if (initialLink) {
        initialLink.classList.add('active');
        activateTab('geral');
    }
}


// --- FUNÇÕES DA ABA VISÃO GERAL ---

// Esta função é chamada sempre que os registros de ponto ou a lista de usuários são atualizados
function updateWorkingNowPanel() {
    const countEl = document.getElementById('workingNowCount');
    const listEl = document.getElementById('workingNowList');
    if (!countEl || !listEl) return;

    const workingNow = allPontoRecords.filter(r => r.status === 'em_andamento');
    countEl.textContent = workingNow.length;
    listEl.innerHTML = '';

    if (workingNow.length === 0) {
        listEl.innerHTML = '<p class="text-center text-gray-500">Ninguém está trabalhando no momento.</p>';
    } else {
        workingNow.forEach(record => {
            const user = allUsers.find(u => u.uid === record.employeeId);
            const entryTime = new Date(record.entrada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            listEl.innerHTML += `
                <div class="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <span class="font-medium text-gray-800 dark:text-gray-200">${user ? user.nomeFantasia : 'ID desconhecido'}</span>
                    <span class="text-gray-600 dark:text-gray-400">Entrada: <strong>${entryTime}</strong></span>
                </div>`;
        });
    }
}