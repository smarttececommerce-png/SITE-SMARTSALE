// js/admin.js (Script Principal do Painel de Administração - VERSÃO FINAL CORRIGIDA)

import { auth, db } from './config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, onSnapshot, getDoc, doc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importa os inicializadores de cada módulo de administração
import { initPontoAdmin } from './admin/ponto.js';
import { initRotinaMetasAdmin } from './admin/rotina-e-metas.js';
import { initOlxAdmin } from './admin/olx.js';
import { initUsuariosAdmin } from './admin/usuarios.js';
import { initFinanceiroAdmin } from './admin/financeiro.js';
import { initDailyTasksAdmin } from './admin/daily-tasks.js';
import { initGoalsAdmin } from './admin/goals.js';

// Armazena dados globais em tempo real para serem compartilhados entre os módulos
let allUsers = [];
let allPontoRecords = [];
let allTasks = [];
let allOlxAds = [];
let allAbsences = [];
let pontoConfig = {};
let allSalesGoals = [];

/**
 * Fornece uma cópia segura dos dados globais para os módulos.
 */
const getGlobalData = () => ({
    users: JSON.parse(JSON.stringify(allUsers)),
    pontoRecords: JSON.parse(JSON.stringify(allPontoRecords)),
    tasks: JSON.parse(JSON.stringify(allTasks)),
    olxAds: JSON.parse(JSON.stringify(allOlxAds)),
    absences: JSON.parse(JSON.stringify(allAbsences)),
    pontoConfig: JSON.parse(JSON.stringify(pontoConfig)),
    salesGoals: JSON.parse(JSON.stringify(allSalesGoals))
});

function initializeDayjs() {
    try {
        const plugins = ['customParseFormat', 'utc', 'timezone', 'isSameOrAfter', 'isSameOrBefore'];
        plugins.forEach(p => {
            if (window[`dayjs_plugin_${p}`]) {
                dayjs.extend(window[`dayjs_plugin_${p}`]);
            }
        });
        dayjs.locale('pt-br');
        dayjs.tz.setDefault("America/Sao_Paulo");
        console.log("Day.js inicializado com sucesso no painel de admin.");
    } catch (error) {
        console.error('Erro na configuração do Day.js no painel de admin:', error);
    }
}

/**
 * Função principal que inicializa todo o painel.
 */
function initializeAdminPanel() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().role === 'admin') {
                console.log("Admin autenticado:", user.email);
                
                initializeDayjs(); 

                loadAllRealtimeData();
                setupEventListeners();
                navigateToSection(window.location.hash || '#geral');
            } else {
                console.warn("Usuário não é admin. Acesso negado.");
                signOut(auth);
                window.location.href = 'index.html';
            }
        } else {
            console.log("Nenhum usuário autenticado. Redirecionando...");
            window.location.href = 'index.html';
        }
    });
}

/**
 * Configura listeners do Firestore para carregar e manter os dados atualizados.
 */
function loadAllRealtimeData() {
    onSnapshot(collection(db, "users"), snapshot => {
        allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboardView();
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'users' } }));
    });

    onSnapshot(collection(db, "registrosPonto"), snapshot => {
        allPontoRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'ponto' } }));
    });

    onSnapshot(collection(db, "kanbanCards"), snapshot => {
        allTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboardView();
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'tasks' } }));
    });
    
    onSnapshot(collection(db, "ads"), snapshot => {
        allOlxAds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'olx' } }));
    });

    onSnapshot(collection(db, "generalAbsences"), snapshot => {
        allAbsences = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'absences' } }));
    });
    
    onSnapshot(doc(db, "configuracaoPonto", "default"), (docSnap) => {
        if (docSnap.exists()) {
            pontoConfig = docSnap.data();
        } else {
            pontoConfig = { toleranciaMinutos: 5, punctualityBonusValue: 50 };
        }
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'config' } }));
    });

    onSnapshot(collection(db, "salesGoals"), (snapshot) => {
        allSalesGoals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'goals' } }));
    });

    // Inicializa todos os módulos
    initPontoAdmin(db, getGlobalData);
    initRotinaMetasAdmin(db, getGlobalData);
    initOlxAdmin(db, getGlobalData);
    initUsuariosAdmin(db, getGlobalData);
    initFinanceiroAdmin(db, getGlobalData);
    initDailyTasksAdmin(db, getGlobalData);
    initGoalsAdmin(db, getGlobalData);
}

/**
 * Atualiza os cartões de resumo na seção "Visão Geral".
 */
async function updateDashboardView() {
    const workingNowList = document.getElementById('workingNowList');
    const workingNowCount = document.getElementById('workingNowCount');
    if (workingNowList && workingNowCount) {
        const workingUsers = allUsers.filter(u => u.statusPonto === 'trabalhando');
        workingNowCount.textContent = workingUsers.length;
        workingNowList.innerHTML = workingUsers.length > 0
            ? workingUsers.map(u => `
                <div class="summary-item">
                    <span>${u.nomeFantasia}</span>
                    <span class="text-green-400 font-semibold">Trabalhando</span>
                </div>
            `).join('')
            : '<p class="text-gray-400 text-sm">Nenhum funcionário registrou ponto como "trabalhando".</p>';
    }

    const pendingTasksCount = document.getElementById('pendingTasksCount');
    if (pendingTasksCount) {
        const pendingTasks = allTasks.filter(t => t.status !== 'feito');
        pendingTasksCount.textContent = pendingTasks.length;
    }

    const completedTasksTodayCount = document.getElementById('completedTasksTodayCount');
    if (completedTasksTodayCount) {
        const today = dayjs().format('YYYY-MM-DD');
        const completionsQuery = query(collection(db, "dailyTaskCompletions"), where("completionDate", "==", today));
        const completionsSnapshot = await getDocs(completionsQuery);
        const dailyCompleted = completionsSnapshot.docs.length;
        completedTasksTodayCount.textContent = dailyCompleted;
    }
}

/**
 * Configura os listeners de eventos para a navegação principal e botão de logout.
 */
function setupEventListeners() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = link.getAttribute('href');
            navigateToSection(sectionId);
        });
    });

    document.getElementById('logoutButton')?.addEventListener('click', () => {
        signOut(auth).catch(error => console.error("Erro ao fazer logout:", error));
    });
}

/**
 * Gerencia a exibição das seções do painel.
 */
function navigateToSection(sectionHash) {
    const cleanSectionId = sectionHash.startsWith('#') ? sectionHash.substring(1) : sectionHash;
    
    document.querySelectorAll('.admin-section').forEach(section => {
        section.style.display = 'none';
    });

    const activeSection = document.getElementById(cleanSectionId);
    if (activeSection) {
        activeSection.style.display = 'block';
    } else {
        document.getElementById('geral').style.display = 'block';
    }

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === sectionHash) {
            link.classList.add('active');
        }
    });

    window.location.hash = cleanSectionId;
}

// Inicia o painel de administração assim que o script é carregado
initializeAdminPanel();

// --- Mantido para facilitar o debug pela consola ---
window.db = db;
window.getGlobalData = getGlobalData;