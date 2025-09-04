// js/admin.js (Script Principal do Painel de Administração - CORRIGIDO)

import { auth, db } from './config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, onSnapshot, getDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importa os inicializadores de cada módulo de administração
import { initPontoAdmin } from './admin/ponto.js';
import { initSmartsaleAdmin } from './admin/smartsale.js';
import { initOlxAdmin } from './admin/olx.js';
import { initUsuariosAdmin } from './admin/usuarios.js';

// Armazena dados globais em tempo real para serem compartilhados entre os módulos
let allUsers = [];
let allPontoRecords = [];
let allTasks = [];
let allOlxAds = [];
let allAbsences = [];

/**
 * Fornece uma cópia segura dos dados globais para os módulos.
 * Isso evita que um módulo modifique acidentalentalmente os dados de outro.
 */
const getGlobalData = () => ({
    users: JSON.parse(JSON.stringify(allUsers)),
    pontoRecords: JSON.parse(JSON.stringify(allPontoRecords)),
    tasks: JSON.parse(JSON.stringify(allTasks)),
    olxAds: JSON.parse(JSON.stringify(allOlxAds)),
    absences: JSON.parse(JSON.stringify(allAbsences)),
});

/**
 * Função principal que inicializa todo o painel.
 */
function initializeAdminPanel() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Verifica se o usuário logado é um administrador
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().role === 'admin') {
                console.log("Admin autenticado:", user.email);
                loadAllRealtimeData();
                setupEventListeners();
                navigateToSection(window.location.hash || '#geral');
            } else {
                // Se não for admin, desloga e redireciona
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
    // Listener para usuários
    onSnapshot(collection(db, "users"), snapshot => {
        allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboardView();
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'users' } }));
    });

    // Listener para registros de ponto
    onSnapshot(collection(db, "registrosPonto"), snapshot => {
        allPontoRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'ponto' } }));
    });

    // Listener para tarefas do Smart Sale
    onSnapshot(collection(db, "tasks"), snapshot => {
        allTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboardView();
    });
    
    // Listener para anúncios da OLX
    onSnapshot(collection(db, "ads"), snapshot => {
        allOlxAds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'olx' } }));
    });

    // Listener para ausências gerais
    onSnapshot(collection(db, "generalAbsences"), snapshot => {
        allAbsences = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'absences' } }));
    });
    
    // Após configurar os listeners, inicializa os módulos que dependem desses dados
    initPontoAdmin(db, getGlobalData);
    initSmartsaleAdmin(db, getGlobalData);
    initOlxAdmin(db, getGlobalData);
    initUsuariosAdmin(db, getGlobalData);
}

/**
 * Atualiza os cartões de resumo na seção "Visão Geral".
 */
function updateDashboardView() {
    // Atualiza lista de funcionários trabalhando
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

    // Atualiza contagem de tarefas pendentes
    const pendingTasksCount = document.getElementById('pendingTasksCount');
    if (pendingTasksCount) {
        const pendingTasks = allTasks.filter(t => t.status !== 'concluido');
        pendingTasksCount.textContent = pendingTasks.length;
    }

    // Atualiza contagem de tarefas concluídas hoje
    const completedTasksTodayCount = document.getElementById('completedTasksTodayCount');
    if (completedTasksTodayCount) {
        const today = dayjs().format('YYYY-MM-DD');
        const completedToday = allTasks.filter(t => t.status === 'concluido' && t.dataConclusao?.startsWith(today));
        completedTasksTodayCount.textContent = completedToday.length;
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
 * @param {string} sectionHash - O ID da seção a ser mostrada (ex: '#ponto').
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
        document.getElementById('geral').style.display = 'block'; // Seção padrão
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