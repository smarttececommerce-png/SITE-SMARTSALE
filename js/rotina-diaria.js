// js/rotina-diaria.js (CORRIGIDO - Erro de consulta do Firestore resolvido)

import { db, auth } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, query, where, serverTimestamp, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let currentUser = null;
let currentEditingCardId = null;

/**
 * Ponto de entrada: verifica a autenticação e inicializa a página.
 */
onAuthStateChanged(auth, user => {
    if (user) {
        currentUser = user;
        initializePage();
    } else {
        window.location.href = 'index.html';
    }
});

/**
 * Função principal que inicializa todos os componentes da página.
 */
function initializePage() {
    loadUserData();
    setupEventListeners();
    initializeKanbanBoard();
    loadAndDisplayDailyTasks();
}

/**
 * Carrega o nome do utilizador para a saudação no cabeçalho.
 */
async function loadUserData() {
    try {
        const userDocRef = doc(db, "users", currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            document.getElementById('header-user-name').textContent = `Bem-vindo, ${userDocSnap.data().nomeFantasia}!`;
        }
    } catch (error) {
        console.error("Erro ao carregar dados do utilizador:", error);
    }
}

/**
 * Configura os event listeners estáticos da página.
 */
function setupEventListeners() {
    // Listeners para o quadro Kanban
    document.querySelectorAll('.add-card-btn').forEach(btn => btn.addEventListener('click', showAddCardForm));
    document.querySelectorAll('.cancel-add-btn').forEach(btn => btn.addEventListener('click', hideAddCardForm));
    document.querySelectorAll('.confirm-add-btn').forEach(btn => btn.addEventListener('click', handleAddNewCard));
    
    // Listeners para o modal de edição do cartão Kanban
    document.getElementById('modal-close-btn').addEventListener('click', closeCardModal);
    document.getElementById('modal-save-btn').addEventListener('click', handleUpdateCardDetails);
    
    // Listener para as checkboxes de tarefas diárias (delegação de eventos)
    document.getElementById('daily-tasks-container')?.addEventListener('change', handleDailyTaskToggle);
}

// ==========================================================================
// FUNÇÕES PARA TAREFAS DIÁRIAS (CHECKLIST)
// ==========================================================================

/**
 * Carrega os modelos de tarefas diárias atribuídos ao utilizador para o dia de hoje
 * e verifica quais já foram concluídas.
 */
async function loadAndDisplayDailyTasks() {
    const dayjs = window.dayjs;
    const today = dayjs().day(); // 0 = Domingo, 1 = Segunda, etc.
    const todayDateString = dayjs().format('YYYY-MM-DD');

    try {
        // CORREÇÃO APLICADA AQUI
        // Passo 1: Obter TODOS os modelos de tarefas para o dia de hoje.
        const templatesQuery = query(
            collection(db, "dailyTaskTemplates"), 
            where("daysOfWeek", "array-contains", today) // Apenas UM array-contains
        );
        const templatesSnapshot = await getDocs(templatesQuery);
        const allTodayTemplates = templatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Passo 2: Filtrar os resultados no lado do cliente para encontrar os que pertencem ao utilizador atual.
        const userAssignedTemplates = allTodayTemplates.filter(template => 
            template.assignedTo && template.assignedTo.includes(currentUser.uid)
        );

        // Passo 3: Obter as tarefas que o utilizador já concluiu hoje
        const completionsQuery = query(
            collection(db, "dailyTaskCompletions"),
            where("userId", "==", currentUser.uid),
            where("completionDate", "==", todayDateString)
        );
        const completionsSnapshot = await getDocs(completionsQuery);
        const completedTaskMap = new Map(completionsSnapshot.docs.map(doc => [doc.data().templateId, doc.id]));

        // Passo 4: Renderizar a lista na UI
        renderDailyTasks(userAssignedTemplates, completedTaskMap);

    } catch (error) {
        console.error("Erro ao carregar tarefas diárias:", error);
        document.getElementById('daily-tasks-container').innerHTML = '<p class="text-red-500">Não foi possível carregar as tarefas.</p>';
    }
}


/**
 * Renderiza a lista de tarefas diárias na UI.
 * @param {Array} templates - Lista de modelos de tarefas para hoje.
 * @param {Map<string, string>} completedMap - Mapa de tarefas concluídas (templateId -> completionId).
 */
function renderDailyTasks(templates, completedMap) {
    const container = document.getElementById('daily-tasks-container');
    if (!container) return;

    if (templates.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic">Nenhuma tarefa recorrente para hoje.</p>';
        return;
    }

    container.innerHTML = templates.map(template => {
        const isCompleted = completedMap.has(template.id);
        return `
            <div>
                <input 
                    type="checkbox" 
                    id="task-${template.id}" 
                    class="task-checkbox-input"
                    data-template-id="${template.id}"
                    data-completion-id="${completedMap.get(template.id) || ''}"
                    ${isCompleted ? 'checked' : ''}
                >
                <label for="task-${template.id}" class="task-checkbox-label">
                    <span class="checkbox-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                        </svg>
                    </span>
                    ${template.title}
                </label>
            </div>
        `;
    }).join('');
}

/**
 * Manipula a marcação/desmarcação de uma tarefa diária.
 * @param {Event} e - O evento de 'change' da checkbox.
 */
async function handleDailyTaskToggle(e) {
    if (!e.target.matches('.task-checkbox-input')) return;

    const checkbox = e.target;
    const templateId = checkbox.dataset.templateId;
    const completionId = checkbox.dataset.completionId;
    const isChecked = checkbox.checked;

    checkbox.disabled = true; // Desativa para evitar cliques duplos

    try {
        if (isChecked) {
            // Marcar como concluída
            const docRef = await addDoc(collection(db, "dailyTaskCompletions"), {
                templateId,
                userId: currentUser.uid,
                completionDate: window.dayjs().format('YYYY-MM-DD'),
                completedAt: serverTimestamp()
            });
            checkbox.dataset.completionId = docRef.id;
        } else {
            // Desmarcar (apagar o registo de conclusão)
            if (completionId) {
                await deleteDoc(doc(db, "dailyTaskCompletions", completionId));
                checkbox.dataset.completionId = '';
            }
        }
    } catch (error) {
        console.error("Erro ao atualizar tarefa:", error);
        alert("Ocorreu um erro ao atualizar o estado da tarefa. Tente novamente.");
        checkbox.checked = !isChecked; // Reverte a alteração visual em caso de erro
    } finally {
        checkbox.disabled = false; // Reativa a checkbox
    }
}

// ==========================================================================
// LÓGICA DO KANBAN
// ==========================================================================

/**
 * Inicializa a funcionalidade de arrastar e soltar (drag-and-drop) e carrega os cartões.
 */
function initializeKanbanBoard() {
    document.querySelectorAll('.cards-container').forEach(column => {
        new Sortable(column, {
            group: 'kanban',
            animation: 150,
            ghostClass: 'ghost-card',
            onEnd: async (evt) => {
                const cardRef = doc(db, "kanbanCards", evt.item.dataset.cardId);
                const newStatus = evt.to.dataset.columnListId;
                try {
                    await updateDoc(cardRef, { status: newStatus });
                } catch (error) {
                    console.error("Erro ao mover cartão:", error);
                    // Idealmente, reverter a mudança visual aqui
                }
            }
        });
    });
    loadKanbanCards();
}

/**
 * Ouve as alterações nos cartões Kanban do utilizador e atualiza a UI.
 */
function loadKanbanCards() {
    const q = query(collection(db, "kanbanCards"), where("userId", "==", currentUser.uid));
    onSnapshot(q, snapshot => {
        // Limpa todas as colunas antes de redesenhar
        document.querySelectorAll('.cards-container').forEach(c => c.innerHTML = '');
        snapshot.docs.forEach(docSnap => {
            const cardData = { id: docSnap.id, ...docSnap.data() };
            const column = document.querySelector(`[data-column-list-id="${cardData.status}"]`);
            if (column) {
                column.appendChild(createCardElement(cardData));
            }
        });
    });
}

/**
 * Cria o elemento HTML para um cartão Kanban.
 * @param {object} cardData - Os dados do cartão.
 * @returns {HTMLElement} O elemento do cartão criado.
 */
function createCardElement(cardData) {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.dataset.cardId = cardData.id;
    card.innerHTML = `<p class="card-title">${cardData.title}</p><button class="delete-card-btn"><i class="fas fa-trash-alt"></i></button>`;
    
    // Abre o modal de edição ao clicar no cartão (exceto no botão de apagar)
    card.addEventListener('click', e => {
        if (!e.target.closest('.delete-card-btn')) {
            openCardModal(cardData);
        }
    });
    
    // Apaga o cartão ao clicar no botão de apagar
    card.querySelector('.delete-card-btn').addEventListener('click', (e) => {
        e.stopPropagation(); // Impede que o clique se propague para o cartão
        deleteCard(cardData.id);
    });

    return card;
}

/**
 * Apaga um cartão Kanban após confirmação.
 * @param {string} cardId - O ID do cartão a ser apagado.
 */
async function deleteCard(cardId) {
    if (confirm("Tem a certeza de que quer apagar esta tarefa?")) {
        try {
            await deleteDoc(doc(db, "kanbanCards", cardId));
        } catch (error) {
            console.error("Erro ao apagar cartão:", error);
            alert("Não foi possível apagar a tarefa.");
        }
    }
}

// --- Funções de UI (Formulários e Modais do Kanban) ---

function showAddCardForm(e) {
    const column = e.target.closest('.kanban-column');
    column.querySelector('.add-card-btn').classList.add('hidden');
    column.querySelector('.add-card-form').classList.remove('hidden');
    column.querySelector('.add-card-textarea').focus();
}

function hideAddCardForm(e) {
    const column = e.target.closest('.kanban-column');
    column.querySelector('.add-card-form').classList.add('hidden');
    column.querySelector('.add-card-btn').classList.remove('hidden');
    column.querySelector('.add-card-textarea').value = '';
}

async function handleAddNewCard(e) {
    const column = e.target.closest('.kanban-column');
    const textarea = column.querySelector('.add-card-textarea');
    const title = textarea.value.trim();
    if (!title) return;

    try {
        await addDoc(collection(db, "kanbanCards"), {
            title,
            description: "",
            status: column.dataset.columnId,
            userId: currentUser.uid,
            createdAt: serverTimestamp()
        });
        hideAddCardForm(e);
    } catch (error) {
        console.error("Erro ao adicionar novo cartão:", error);
        alert("Não foi possível criar a tarefa.");
    }
}

function openCardModal(cardData) {
    currentEditingCardId = cardData.id;
    document.getElementById('modal-title-input').value = cardData.title;
    document.getElementById('modal-description-textarea').value = cardData.description || "";
    document.getElementById('card-modal').classList.remove('hidden');
}

function closeCardModal() {
    currentEditingCardId = null;
    document.getElementById('card-modal').classList.add('hidden');
}

async function handleUpdateCardDetails() {
    if (!currentEditingCardId) return;
    const newTitle = document.getElementById('modal-title-input').value.trim();
    if (!newTitle) {
        alert("O título não pode ficar vazio.");
        return;
    }
    const newDescription = document.getElementById('modal-description-textarea').value.trim();
    const cardRef = doc(db, "kanbanCards", currentEditingCardId);

    try {
        await updateDoc(cardRef, { title: newTitle, description: newDescription });
        closeCardModal();
    } catch (error) {
        console.error("Erro ao atualizar o cartão:", error);
        alert("Não foi possível guardar as alterações.");
    }
}