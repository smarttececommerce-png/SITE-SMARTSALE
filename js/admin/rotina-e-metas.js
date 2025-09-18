// js/admin/rotina-e-metas.js (Anteriormente smartsale.js)

import { collection, onSnapshot, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let db;
let getGlobalData;

/**
 * Inicializa o módulo de administração de Rotina e Metas.
 * @param {object} firestoreInstance - A instância do Firestore.
 * @param {function} globalDataGetter - Função para obter os dados globais.
 */
export function initRotinaMetasAdmin(firestoreInstance, globalDataGetter) {
    db = firestoreInstance;
    getGlobalData = globalDataGetter;

    console.log("Módulo de Admin de Rotina e Metas inicializado.");
    
    // Ouve o evento de atualização de dados para redesenhar a UI
    window.addEventListener('dataUpdated', (e) => {
        // Redesenha se qualquer um dos dados relevantes for alterado
        const relevantData = ['users', 'tasks', 'dailyTasks']; // 'dailyTasks' será um novo tipo de evento
        if (relevantData.includes(e.detail.dataType)) {
            displayDailyTaskProgress();
        }
    });

    // Inicia um listener para as conclusões de tarefas diárias
    listenToDailyTaskCompletions();
}


/**
 * Escuta as mudanças na coleção de conclusões de tarefas diárias.
 */
function listenToDailyTaskCompletions() {
    const dayjs = window.dayjs;
    const todayDateString = dayjs().format('YYYY-MM-DD');

    const q = query(collection(db, "dailyTaskCompletions"), where("completionDate", "==", todayDateString));
    
    onSnapshot(q, (snapshot) => {
        // Quando as conclusões mudam, dispara um evento para a UI ser atualizada.
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'dailyTasks' } }));
    });
}


/**
 * Busca e exibe o progresso das tarefas diárias de cada funcionário.
 */
async function displayDailyTaskProgress() {
    const container = document.getElementById('daily-task-progress-container');
    if (!container) return;

    const { users } = getGlobalData();
    const dayjs = window.dayjs;
    const today = dayjs().day();
    const todayDateString = dayjs().format('YYYY-MM-DD');

    const usersWithTasks = users.filter(u => u.role !== 'admin');
    if (usersWithTasks.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic">Nenhum funcionário para monitorizar.</p>';
        return;
    }

    // 1. Buscar os modelos de tarefas de hoje
    const templatesQuery = query(collection(db, "dailyTaskTemplates"), where("daysOfWeek", "array-contains", today));
    const templatesSnapshot = await getDocs(templatesQuery);
    const todayTemplates = templatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (todayTemplates.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic">Nenhuma tarefa diária configurada para hoje.</p>';
        return;
    }

    // 2. Buscar as conclusões de hoje
    const completionsQuery = query(collection(db, "dailyTaskCompletions"), where("completionDate", "==", todayDateString));
    const completionsSnapshot = await getDocs(completionsQuery);
    const completionsByUser = new Map();
    completionsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (!completionsByUser.has(data.userId)) {
            completionsByUser.set(data.userId, []);
        }
        completionsByUser.get(data.userId).push(data.templateId);
    });

    // 3. Renderizar o progresso
    container.innerHTML = usersWithTasks.map(user => {
        const completedCount = completionsByUser.get(user.id)?.length || 0;
        const progressPercentage = todayTemplates.length > 0 ? (completedCount / todayTemplates.length) * 100 : 0;
        
        return `
            <div class="user-item">
                <div class="flex-grow">
                    <div class="flex justify-between items-center mb-2">
                        <p class="font-semibold text-white">${user.nomeFantasia}</p>
                        <span class="text-sm font-bold ${progressPercentage === 100 ? 'text-green-400' : 'text-gray-400'}">
                            ${completedCount} / ${todayTemplates.length}
                        </span>
                    </div>
                    <div class="w-full bg-gray-700 rounded-full h-2.5">
                        <div class="bg-blue-600 h-2.5 rounded-full" style="width: ${progressPercentage}%"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}