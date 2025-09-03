/* js/smartsale-module.js */
import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { motivationalQuotes } from './config.js';

let db;
let currentUser;
let unsubscribeTasks = null;

function getMotivationalQuote() {
    const quote = motivationalQuotes[new Date().getDate() % motivationalQuotes.length];
    return `<p class="italic">"${quote.text}"</p><small class="opacity-80">- ${quote.author}</small>`;
}

export function initSmartSale(app, user, showScreen) {
    db = getFirestore(app);
    currentUser = user;
    const container = document.getElementById('smartsale-screen');

    // Estrutura HTML da página Smart Sale
    container.innerHTML = `
        <header class="app-header">
            <button id="smartsale-back-btn" class="back-to-hub"><i class="fas fa-arrow-left mr-2"></i>Voltar ao HUB</button>
            <h2 class="text-xl font-bold">Smart Sale - Gestão de Equipa</h2>
            <div></div>
        </header>
        <div id="smartsale-content" class="p-4 md:p-6 lg:p-8">
            <div class="mb-6 bg-blue-500 text-white p-4 rounded-lg text-center shadow-lg">${getMotivationalQuote()}</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="card-ss">
                    <h3 class="text-lg font-semibold">Minhas Tarefas</h3>
                    <div id="ss-tasks-list" class="space-y-3 mt-4">Carregando...</div>
                </div>
                <div class="card-ss" id="ss-dynamic-panel">
                    <!-- Painel do Admin ou de Metas será inserido aqui -->
                </div>
            </div>
        </div>
    `;

    // Renderiza o painel correto para o tipo de utilizador
    if (currentUser && currentUser.role === 'admin') {
        renderAdminPanel();
    } else {
        renderSalesPanel();
    }

    // Associa os listeners
    document.getElementById('smartsale-back-btn').addEventListener('click', () => showScreen('hub'));
    listenToUserTasks(currentUser.uid);
}

function listenToUserTasks(userId) {
    if (unsubscribeTasks) unsubscribeTasks();
    const q = query(collection(db, "tasks"), where("userId", "==", userId), where("status", "==", "pendente"));
    unsubscribeTasks = onSnapshot(q, snapshot => {
        const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const listEl = document.getElementById('ss-tasks-list');
        if (!listEl) return;
        listEl.innerHTML = tasks.length === 0 
            ? '<p class="text-gray-500">Nenhuma tarefa pendente.</p>'
            : tasks.map(task => `
                <div class="ss-task">
                    <span>${task.description}</span>
                    <button data-id="${task.id}" class="complete-task-btn bg-green-500 text-white text-xs px-2 py-1 rounded">Concluir</button>
                </div>`).join('');
        
        listEl.querySelectorAll('.complete-task-btn').forEach(btn => btn.addEventListener('click', (e) => {
            const taskRef = doc(db, "tasks", e.target.dataset.id);
            updateDoc(taskRef, { status: "concluida" });
        }));
    });
}

async function renderAdminPanel() {
    const container = document.getElementById('ss-dynamic-panel');
    container.innerHTML = `
        <h3 class="text-lg font-semibold">Painel Administrativo</h3>
        <div class="mt-4">
            <h4 class="font-medium">Adicionar Tarefa</h4>
            <select id="admin-task-user" class="w-full p-2 border rounded mt-2 bg-gray-50 dark:bg-gray-700 dark:border-gray-600"></select>
            <input id="admin-task-desc" placeholder="Descrição da tarefa" class="w-full p-2 border rounded mt-2 bg-gray-50 dark:bg-gray-700 dark:border-gray-600" />
            <button id="admin-add-task-btn" class="bg-blue-600 text-white w-full mt-2 py-2 rounded">Adicionar</button>
        </div>
    `;

    const userSelect = document.getElementById('admin-task-user');
    
    // Carrega os utilizadores da base de dados
    const usersQuery = query(collection(db, "users"), where("role", "!=", "admin"));
    const querySnapshot = await getDocs(usersQuery);
    const employees = querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    
    userSelect.innerHTML = employees.map(user => `<option value="${user.uid}">${user.nomeFantasia}</option>`).join('');
    
    document.getElementById('admin-add-task-btn').addEventListener('click', () => {
        const userId = userSelect.value;
        const descInput = document.getElementById('admin-task-desc');
        if (!descInput.value.trim() || !userId) return;
        addDoc(collection(db, "tasks"), { 
            userId, 
            description: descInput.value.trim(), 
            status: "pendente", 
            createdAt: new Date() 
        });
        descInput.value = '';
    });
}

function renderSalesPanel() {
    document.getElementById('ss-dynamic-panel').innerHTML = `
        <h3 class="text-lg font-semibold">Metas de Vendas</h3>
        <p class="text-gray-500 mt-4">Módulo de metas em desenvolvimento.</p>
    `;
}

