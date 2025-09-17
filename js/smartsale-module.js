// js/smartsale-module.js
import {
    collection,
    query,
    where,
    onSnapshot,
    doc,
    updateDoc,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let db; // Variável para armazenar a instância do Firestore
let currentUser;
let showScreen;

// Variável global para manter a referência do listener do Firestore
let unsubscribeTasks = null;

export function initSmartSale(databaseInstance, user, showScreenCallback) {
    // CORREÇÃO: Atribui a instância do Firestore diretamente, em vez de chamar getFirestore() novamente.
    db = databaseInstance;
    currentUser = user;
    showScreen = showScreenCallback;

    console.log("Módulo SmartSale inicializado para:", currentUser.nomeFantasia);

    // Carrega o conteúdo HTML do módulo no container
    loadModuleContent();

    // Adiciona event listeners e busca os dados depois que o conteúdo for carregado.
    // Usamos um pequeno timeout para garantir que o DOM foi atualizado.
    setTimeout(() => {
        setupEventListeners();
        fetchAndDisplayTasks();
    }, 100);
}

function loadModuleContent() {
    const container = document.getElementById('smartsale-screen');
    if (!container) {
        console.error("Container do SmartSale não encontrado!");
        return;
    }
    // O HTML do módulo SmartSale vai aqui.
    // Este é um exemplo de estrutura, você deve adaptá-lo às suas necessidades.
    container.innerHTML = `
        <div class="smartsale-container bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 p-4 sm:p-6 lg:p-8 min-h-screen">
            <header class="flex flex-wrap justify-between items-center mb-6 gap-4">
                <div>
                    <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Smart Sale - Gestor de Tarefas</h1>
                    <p class="text-gray-600 dark:text-gray-400">Bem-vindo, ${currentUser.nomeFantasia}!</p>
                </div>
                <button id="smartsale-back-to-hub" class="btn btn-secondary">
                    <i class="fas fa-arrow-left mr-2"></i> Voltar ao Hub
                </button>
            </header>
            
            <main class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div class="lg:col-span-1 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    <h2 class="text-xl font-bold mb-4">Adicionar Nova Tarefa</h2>
                    <form id="add-task-form" class="space-y-4">
                        <input type="text" id="task-title" placeholder="Título da Tarefa" class="w-full input-style" required>
                        <textarea id="task-description" placeholder="Descrição (opcional)" class="w-full input-style" rows="4"></textarea>
                        <select id="task-priority" class="w-full input-style">
                            <option value="baixa">Prioridade Baixa</option>
                            <option value="media" selected>Prioridade Média</option>
                            <option value="alta">Prioridade Alta</option>
                        </select>
                        <button type="submit" class="btn btn-primary w-full">Adicionar Tarefa</button>
                    </form>
                </div>

                <div class="lg:col-span-2 space-y-6">
                    <div>
                        <h2 class="text-xl font-bold mb-4">A Fazer</h2>
                        <div id="tasks-todo" class="task-list space-y-3">
                            </div>
                    </div>
                     <div>
                        <h2 class="text-xl font-bold mb-4">Concluídas</h2>
                        <div id="tasks-done" class="task-list space-y-3">
                            </div>
                    </div>
                </div>
            </main>
        </div>
    `;
}

function setupEventListeners() {
    const backButton = document.getElementById('smartsale-back-to-hub');
    if (backButton) {
        backButton.addEventListener('click', () => {
            // Cancela o listener do Firestore para evitar consumo desnecessário de recursos
            if (unsubscribeTasks) {
                unsubscribeTasks();
                unsubscribeTasks = null;
            }
            showScreen('hub');
        });
    }

    const addTaskForm = document.getElementById('add-task-form');
    if (addTaskForm) {
        addTaskForm.addEventListener('submit', handleAddTask);
    }
}

async function handleAddTask(event) {
    event.preventDefault();
    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-description').value.trim();
    const priority = document.getElementById('task-priority').value;

    if (!title) {
        alert("O título da tarefa é obrigatório.");
        return;
    }

    try {
        await addDoc(collection(db, 'tasks'), {
            title: title,
            description: description,
            priority: priority,
            assignedTo: currentUser.uid,
            status: 'pendente', // pendente, concluida
            createdAt: serverTimestamp()
        });
        // Limpa o formulário
        event.target.reset();
    } catch (error) {
        console.error("Erro ao adicionar tarefa: ", error);
        alert("Não foi possível adicionar a tarefa. Tente novamente.");
    }
}

function fetchAndDisplayTasks() {
    // Se já houver um listener ativo, cancela-o antes de criar um novo
    if (unsubscribeTasks) {
        unsubscribeTasks();
    }

    const tasksCollection = collection(db, 'tasks');
    // Cria uma query para buscar tarefas atribuídas ao usuário atual
    const q = query(
        tasksCollection, 
        where("assignedTo", "==", currentUser.uid)
    );

    unsubscribeTasks = onSnapshot(q, (querySnapshot) => {
        const todoTasks = [];
        const doneTasks = [];

        querySnapshot.forEach((doc) => {
            const task = { id: doc.id, ...doc.data() };
            if (task.status === 'concluida') {
                doneTasks.push(task);
            } else {
                todoTasks.push(task);
            }
        });

        // Ordena as tarefas por prioridade
        const priorityOrder = { 'alta': 1, 'media': 2, 'baixa': 3 };
        todoTasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        renderTasks(todoTasks, 'tasks-todo');
        renderTasks(doneTasks, 'tasks-done');

    }, (error) => {
        console.error("Erro ao buscar tarefas: ", error);
        alert("Não foi possível carregar as tarefas.");
    });
}

function renderTasks(tasks, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = ''; // Limpa a lista antes de renderizar

    if (tasks.length === 0) {
        container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 italic">Nenhuma tarefa aqui.</p>';
        return;
    }

    tasks.forEach(task => {
        const taskElement = document.createElement('div');
        taskElement.className = `task-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow flex items-center justify-between gap-4 ${task.status === 'concluida' ? 'opacity-60' : ''}`;
        taskElement.dataset.id = task.id;

        const priorityClasses = {
            alta: 'bg-red-500',
            media: 'bg-yellow-500',
            baixa: 'bg-green-500'
        };

        taskElement.innerHTML = `
            <div class="flex items-center gap-4 flex-grow">
                 <div class="w-1.5 h-10 rounded-full ${priorityClasses[task.priority] || 'bg-gray-400'}"></div>
                <input type="checkbox" class="task-checkbox h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" ${task.status === 'concluida' ? 'checked' : ''}>
                <div>
                    <p class="font-semibold ${task.status === 'concluida' ? 'line-through' : ''}">${task.title}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">${task.description || ''}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-xs font-medium capitalize px-2 py-1 rounded-full bg-gray-200 dark:bg-gray-700">${task.priority}</span>
            </div>
        `;

        container.appendChild(taskElement);
    });
    
    // Adiciona os event listeners aos checkboxes após renderizar
    container.querySelectorAll('.task-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', handleTaskStatusChange);
    });
}

async function handleTaskStatusChange(event) {
    const checkbox = event.target;
    const taskCard = checkbox.closest('.task-card');
    const taskId = taskCard.dataset.id;
    const newStatus = checkbox.checked ? 'concluida' : 'pendente';

    const taskRef = doc(db, 'tasks', taskId);

    try {
        await updateDoc(taskRef, {
            status: newStatus
        });
    } catch (error) {
        console.error("Erro ao atualizar status da tarefa: ", error);
        // Reverte a mudança no checkbox se a atualização falhar
        alert("Não foi possível atualizar a tarefa.");
        checkbox.checked = !checkbox.checked;
    }
} 