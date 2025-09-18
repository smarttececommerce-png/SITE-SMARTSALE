// js/admin/daily-tasks.js (Módulo para Gerir Tarefas Diárias Recorrentes - REVISADO)

import { collection, addDoc, onSnapshot, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let db;
let getGlobalData;

// Constante para os dias da semana, para consistência e clareza
const weekDays = [
    { label: 'D', value: 0 }, { label: 'S', value: 1 },
    { label: 'T', value: 2 }, { label: 'Q', value: 3 },
    { label: 'Q', value: 4 }, { label: 'S', value: 5 },
    { label: 'S', value: 6 }
];

/**
 * Inicializa o módulo de gestão de tarefas diárias.
 * @param {object} firestoreInstance - A instância do Firestore.
 * @param {function} globalDataGetter - Função para obter a lista de utilizadores.
 */
export function initDailyTasksAdmin(firestoreInstance, globalDataGetter) {
    db = firestoreInstance;
    getGlobalData = globalDataGetter;
    console.log("Módulo de Admin de Tarefas Diárias inicializado.");

    setupEventListeners();
    renderWeekDaysCheckboxes();
    listenToTaskTemplates();
    
    // Ouve as atualizações na lista de utilizadores para popular a checklist de atribuição
    window.addEventListener('dataUpdated', (e) => {
        if (e.detail.dataType === 'users') {
            populateUserCheckboxes();
        }
    });
}

/**
 * Popula o contentor de atribuição de tarefas com checkboxes dos funcionários.
 */
function populateUserCheckboxes() {
    const container = document.getElementById('daily-task-assign-checkboxes');
    if (!container) return;

    const { users } = getGlobalData();
    const employees = users.filter(u => u.role !== 'admin'); // Exclui administradores

    container.innerHTML = employees.map(user => `
        <div>
            <label class="user-checkbox-label">
                <input type="checkbox" value="${user.id}" class="mr-3 rounded border-gray-500 text-blue-500 focus:ring-blue-500 bg-gray-800">
                <span>${user.nomeFantasia}</span>
            </label>
        </div>
    `).join('') || '<p class="text-gray-500 italic">Nenhum funcionário encontrado.</p>';
}

/**
 * Configura os listeners de eventos para o formulário e a lista de tarefas.
 */
function setupEventListeners() {
    document.getElementById('daily-task-template-form')?.addEventListener('submit', handleAddTaskTemplate);
    document.getElementById('daily-task-template-list')?.addEventListener('click', handleDeleteTaskTemplate);
}

/**
 * Renderiza os checkboxes para seleção dos dias da semana no formulário.
 */
function renderWeekDaysCheckboxes() {
    const container = document.getElementById('daily-task-days');
    if (!container) return;

    container.innerHTML = weekDays.map(day => `
        <div>
            <input type="checkbox" id="day-${day.value}" value="${day.value}" class="day-checkbox-input">
            <label for="day-${day.value}" class="day-checkbox-label">${day.label}</label>
        </div>
    `).join('');
}

/**
 * Manipula o envio do formulário para adicionar um novo modelo de tarefa.
 * @param {Event} e - O evento de submit do formulário.
 */
async function handleAddTaskTemplate(e) {
    e.preventDefault();
    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');
    
    const title = form.querySelector('#daily-task-title').value.trim();
    const assignedUserIds = Array.from(form.querySelectorAll('#daily-task-assign-checkboxes input:checked')).map(cb => cb.value);
    const daysOfWeek = Array.from(form.querySelectorAll('#daily-task-days input:checked')).map(cb => parseInt(cb.value, 10));

    // Validação robusta
    if (!title || daysOfWeek.length === 0 || assignedUserIds.length === 0) {
        alert("Por favor, preencha o título, selecione pelo menos um dia e atribua a pelo menos um funcionário.");
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "A adicionar...";

    try {
        await addDoc(collection(db, "dailyTaskTemplates"), {
            title: title,
            daysOfWeek: daysOfWeek,
            assignedTo: assignedUserIds,
            createdAt: new Date()
        });
        
        // Limpa o formulário de forma mais completa
        form.reset(); 
        form.querySelectorAll('.day-checkbox-input').forEach(cb => cb.checked = false);

    } catch (error) {
        console.error("Erro ao adicionar modelo de tarefa:", error);
        alert("Ocorreu um erro ao guardar a tarefa.");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Adicionar Tarefa";
    }
}

/**
 * Ouve as mudanças na coleção de modelos de tarefas e chama a função para renderizar a lista.
 */
function listenToTaskTemplates() {
    const q = collection(db, "dailyTaskTemplates");
    onSnapshot(q, (snapshot) => {
        const templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTaskTemplateList(templates);
    });
}

/**
 * Renderiza a lista de modelos de tarefas existentes.
 * @param {Array<object>} templates - A lista de modelos de tarefas.
 */
function renderTaskTemplateList(templates) {
    const container = document.getElementById('daily-task-template-list');
    if (!container) return;
    
    const { users } = getGlobalData();
    const userMap = new Map(users.map(u => [u.id, u.nomeFantasia]));

    if (templates.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic">Nenhuma tarefa diária configurada.</p>';
        return;
    }

    container.innerHTML = templates.map(template => {
        const assignedNames = (template.assignedTo || []).map(id => userMap.get(id) || 'Utilizador desconhecido').join(', ');
        
        return `
        <div class="user-item">
            <div>
                <p class="font-semibold text-white">${template.title}</p>
                <p class="text-xs text-gray-400 mt-1">Atribuído a: ${assignedNames}</p>
                <div class="flex gap-2 mt-2">
                    ${weekDays.map(day => `
                        <span class="text-xs font-mono px-2 py-1 rounded ${template.daysOfWeek.includes(day.value) ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}">
                            ${day.label}
                        </span>
                    `).join('')}
                </div>
            </div>
            <button data-id="${template.id}" data-action="delete" class="btn btn-sm btn-danger">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `}).join('');
}

/**
 * Manipula o clique no botão de apagar um modelo de tarefa.
 * @param {Event} e - O evento de clique.
 */
async function handleDeleteTaskTemplate(e) {
    const button = e.target.closest('button[data-action="delete"]');
    if (!button) return;

    const templateId = button.dataset.id;
    if (confirm("Tem a certeza de que deseja apagar este modelo de tarefa? As tarefas já concluídas não serão afetadas.")) {
        try {
            button.disabled = true; // Desativa o botão para evitar cliques duplos
            await deleteDoc(doc(db, "dailyTaskTemplates", templateId));
        } catch (error) {
            console.error("Erro ao apagar modelo de tarefa:", error);
            alert("Ocorreu um erro ao apagar a tarefa.");
            button.disabled = false; // Reativa em caso de erro
        }
    }
}