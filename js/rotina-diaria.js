import { db, auth } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, query, where, serverTimestamp, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let currentUser = null;
let currentEditingCardId = null;

function initRotinaDiaria() {
    onAuthStateChanged(auth, user => {
        if (user) {
            currentUser = user;
            loadUserData();
            setupEventListeners();
            initializeKanbanBoard();
            loadAndDisplayDailyTasks();
        } else {
            window.location.href = 'index.html';
        }
    });
}

async function loadUserData() {
    const userDocRef = doc(db, "users", currentUser.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
        document.getElementById('header-user-name').textContent = `Bem-vindo, ${userDocSnap.data().nomeFantasia}!`;
    }
}

function setupEventListeners() {
    document.querySelectorAll('.add-card-btn').forEach(btn => btn.addEventListener('click', showAddCardForm));
    document.querySelectorAll('.cancel-add-btn').forEach(btn => btn.addEventListener('click', hideAddCardForm));
    document.querySelectorAll('.confirm-add-btn').forEach(btn => btn.addEventListener('click', handleAddNewCard));
    document.getElementById('modal-close-btn').addEventListener('click', closeCardModal);
    document.getElementById('modal-save-btn').addEventListener('click', handleUpdateCardDetails);
    document.getElementById('daily-tasks-container')?.addEventListener('change', handleDailyTaskToggle);
}

// ==========================================================================
// FUNÇÕES PARA TAREFAS DIÁRIAS (CHECKBOX)
// ==========================================================================

async function loadAndDisplayDailyTasks() {
    const dayjs = window.dayjs;
    const today = dayjs().day();
    const todayDateString = dayjs().format('YYYY-MM-DD');

    const templatesQuery = query(
        collection(db, "dailyTaskTemplates"), 
        where("daysOfWeek", "array-contains", today)
    );
    const templatesSnapshot = await getDocs(templatesQuery);

    const allTodayTemplates = templatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const userAssignedTemplates = allTodayTemplates.filter(template => 
        template.assignedTo && template.assignedTo.includes(currentUser.uid)
    );

    const completionsQuery = query(
        collection(db, "dailyTaskCompletions"),
        where("userId", "==", currentUser.uid),
        where("completionDate", "==", todayDateString)
    );
    const completionsSnapshot = await getDocs(completionsQuery);
    const completedTasks = new Map(completionsSnapshot.docs.map(doc => [doc.data().templateId, doc.id]));

    const container = document.getElementById('daily-tasks-container');
    if (!container) return;

    if (userAssignedTemplates.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic">Nenhuma tarefa recorrente para hoje.</p>';
        return;
    }

    container.innerHTML = userAssignedTemplates.map(template => {
        const isCompleted = completedTasks.has(template.id);
        return `
            <div>
                <input 
                    type="checkbox" 
                    id="task-${template.id}" 
                    class="task-checkbox-input"
                    data-template-id="${template.id}"
                    data-completion-id="${completedTasks.get(template.id) || ''}"
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


async function handleDailyTaskToggle(e) {
    if (!e.target.matches('.task-checkbox-input')) return;

    const checkbox = e.target;
    const templateId = checkbox.dataset.templateId;
    const completionId = checkbox.dataset.completionId;
    const isChecked = checkbox.checked;

    const dayjs = window.dayjs;
    const todayDateString = dayjs().format('YYYY-MM-DD');

    if (isChecked) {
        try {
            const docRef = await addDoc(collection(db, "dailyTaskCompletions"), {
                templateId: templateId,
                userId: currentUser.uid,
                completionDate: todayDateString,
                completedAt: serverTimestamp()
            });
            checkbox.dataset.completionId = docRef.id;
        } catch (error) {
            console.error("Erro ao marcar tarefa como concluída:", error);
            checkbox.checked = false;
        }
    } else {
        if (completionId) {
            try {
                await deleteDoc(doc(db, "dailyTaskCompletions", completionId));
                checkbox.dataset.completionId = '';
            } catch (error) {
                console.error("Erro ao desmarcar tarefa:", error);
                checkbox.checked = true;
            }
        }
    }
}


// ==========================================================================
// LÓGICA DO KANBAN
// ==========================================================================

function initializeKanbanBoard() {
    document.querySelectorAll('.cards-container').forEach(column => {
        new Sortable(column, {
            group: 'kanban', animation: 150, ghostClass: 'ghost-card',
            onEnd: async (evt) => {
                const cardRef = doc(db, "kanbanCards", evt.item.dataset.cardId);
                await updateDoc(cardRef, { status: evt.to.dataset.columnListId });
            }
        });
    });
    loadKanbanCards();
}

function loadKanbanCards() {
    const q = query(collection(db, "kanbanCards"), where("userId", "==", currentUser.uid));
    onSnapshot(q, snapshot => {
        document.querySelectorAll('.cards-container').forEach(c => c.innerHTML = '');
        snapshot.docs.forEach(docSnap => {
            const cardData = { id: docSnap.id, ...docSnap.data() };
            const column = document.querySelector(`[data-column-list-id="${cardData.status}"]`);
            if (column) column.appendChild(createCardElement(cardData));
        });
    });
}

function createCardElement(cardData) {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.dataset.cardId = cardData.id;
    card.innerHTML = `<p class="card-title">${cardData.title}</p><button class="delete-card-btn"><i class="fas fa-trash-alt"></i></button>`;
    card.addEventListener('click', e => { if (!e.target.closest('.delete-card-btn')) openCardModal(cardData); });
    card.querySelector('.delete-card-btn').addEventListener('click', () => deleteCard(cardData.id));
    return card;
}

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
        await addDoc(collection(db, "kanbanCards"), { title, description: "", status: column.dataset.columnId, userId: currentUser.uid, createdAt: serverTimestamp() });
        hideAddCardForm(e);
    } catch (error) { console.error("Erro ao adicionar novo card:", error); }
}

async function deleteCard(cardId) {
    if (confirm("Tem certeza?")) await deleteDoc(doc(db, "kanbanCards", cardId));
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
    const newDescription = document.getElementById('modal-description-textarea').value.trim();
    if (!newTitle) return alert("O título não pode ficar vazio.");
    const cardRef = doc(db, "kanbanCards", currentEditingCardId);
    try {
        await updateDoc(cardRef, { title: newTitle, description: newDescription });
        closeCardModal();
    } catch (error) { console.error("Erro ao atualizar o card:", error); }
}

initRotinaDiaria();