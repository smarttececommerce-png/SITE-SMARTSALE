// js/admin/goals.js (Módulo para Gerir Metas de Vendas - REVISADO)

import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let db;
let getGlobalData;
let currentEditingGoalId = null; // Controla se o formulário está em modo de edição

/**
 * Inicializa o módulo de gestão de metas de vendas.
 * @param {object} firestoreInstance - A instância do Firestore.
 * @param {function} globalDataGetter - Função para obter dados globais.
 */
export function initGoalsAdmin(firestoreInstance, globalDataGetter) {
    db = firestoreInstance;
    getGlobalData = globalDataGetter;
    console.log("Módulo de Admin de Metas de Vendas inicializado.");

    setupEventListeners();
    listenToSalesGoals();

    window.addEventListener('dataUpdated', (e) => {
        if (e.detail.dataType === 'users') {
            populateUserSelect();
        }
    });
}

/**
 * Popula o seletor de atribuição de metas com os funcionários.
 */
function populateUserSelect() {
    const select = document.getElementById('goal-assign');
    if (!select) return;

    const { users } = getGlobalData();
    const employees = users.filter(u => u.role !== 'admin');
    
    const selectedValue = select.value;

    select.innerHTML = '<option value="">Selecione um funcionário</option>';
    select.innerHTML += employees.map(user => 
        `<option value="${user.id}">${user.nomeFantasia}</option>`
    ).join('');

    select.value = selectedValue; // Mantém a seleção anterior, se possível
}

/**
 * Configura os listeners de eventos para o formulário e a lista de metas.
 */
function setupEventListeners() {
    const form = document.getElementById('sales-goal-form');
    form?.addEventListener('submit', handleAddOrUpdateSalesGoal);

    const listContainer = document.getElementById('sales-goal-list');
    listContainer?.addEventListener('click', handleListActions);
}

/**
 * Manipula o envio do formulário para ADICIONAR ou ATUALIZAR uma meta.
 * @param {Event} e - O evento de submit.
 */
async function handleAddOrUpdateSalesGoal(e) {
    e.preventDefault();
    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');

    const assignedTo = form.querySelector('#goal-assign').value;
    const category = form.querySelector('#goal-category').value;
    const quantityMin = parseInt(form.querySelector('#goal-quantity-min').value, 10);
    const quantityMax = parseInt(form.querySelector('#goal-quantity-max').value, 10);
    const bonus = parseFloat(form.querySelector('#goal-bonus').value);

    // Validações robustas
    if (!assignedTo || !category || isNaN(quantityMin) || isNaN(quantityMax) || isNaN(bonus)) {
        alert("Por favor, preencha todos os campos com valores válidos.");
        return;
    }
    if (quantityMin > quantityMax) {
        alert("A quantidade mínima não pode ser maior que a máxima.");
        return;
    }
    
    const description = `Vender de ${quantityMin} a ${quantityMax} produtos (${category}) para ganhar R$${bonus.toFixed(2)}`;
    const goalData = { assignedTo, category, quantityMin, quantityMax, bonus, description };

    submitButton.disabled = true;
    submitButton.textContent = "A guardar...";

    try {
        if (currentEditingGoalId) {
            // Atualiza uma meta existente
            const goalRef = doc(db, "salesGoals", currentEditingGoalId);
            await updateDoc(goalRef, goalData);
        } else {
            // Cria uma nova meta
            goalData.createdAt = new Date();
            await addDoc(collection(db, "salesGoals"), goalData);
        }
        resetForm(form);
    } catch (error) {
        console.error("Erro ao guardar meta de vendas:", error);
        alert("Ocorreu um erro ao guardar a meta.");
    } finally {
        submitButton.disabled = false;
        // O texto do botão é resetado na função `resetForm`
    }
}

/**
 * Manipula os cliques nos botões de editar e apagar na lista de metas.
 * @param {Event} e - O evento de clique.
 */
async function handleListActions(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const { action, id } = button.dataset;
    
    if (action === 'delete') {
        if (confirm("Tem a certeza de que deseja apagar esta meta de vendas?")) {
            try {
                button.disabled = true;
                await deleteDoc(doc(db, "salesGoals", id));
            } catch (error) {
                console.error("Erro ao apagar meta:", error);
                alert("Ocorreu um erro ao apagar a meta.");
                button.disabled = false;
            }
        }
    } else if (action === 'edit') {
        const { salesGoals } = getGlobalData();
        const goalToEdit = salesGoals.find(g => g.id === id);
        if (goalToEdit) {
            populateFormForEdit(goalToEdit);
        }
    }
}

/**
 * Preenche o formulário com os dados de uma meta para edição.
 * @param {object} goal - A meta a ser editada.
 */
function populateFormForEdit(goal) {
    currentEditingGoalId = goal.id;
    const form = document.getElementById('sales-goal-form');
    
    form.querySelector('#goal-assign').value = goal.assignedTo;
    form.querySelector('#goal-category').value = goal.category;
    form.querySelector('#goal-quantity-min').value = goal.quantityMin;
    form.querySelector('#goal-quantity-max').value = goal.quantityMax;
    form.querySelector('#goal-bonus').value = goal.bonus;
    
    form.querySelector('button[type="submit"]').textContent = "Guardar Alterações";
    form.scrollIntoView({ behavior: 'smooth' }); // Rola a página até o formulário
}

/**
 * Ouve as mudanças na coleção de metas e renderiza a lista.
 */
function listenToSalesGoals() {
    const q = collection(db, "salesGoals");
    onSnapshot(q, (snapshot) => {
        const goals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Disponibiliza as metas para outros módulos através do evento
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'goals', data: goals } }));
        renderSalesGoalList(goals);
    });
}

/**
 * Renderiza a lista de metas de vendas existentes.
 * @param {Array<object>} goals - A lista de metas.
 */
function renderSalesGoalList(goals) {
    const container = document.getElementById('sales-goal-list');
    if (!container) return;

    const { users } = getGlobalData();
    const userMap = new Map(users.map(u => [u.id, u.nomeFantasia]));

    if (goals.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic">Nenhuma meta de vendas configurada.</p>';
        return;
    }

    container.innerHTML = goals.map(goal => {
        const assignedName = userMap.get(goal.assignedTo) || 'Funcionário não encontrado';
        return `
        <div class="user-item">
            <div class="flex-grow">
                <p class="font-semibold text-white">${goal.description}</p>
                <p class="text-xs text-gray-400 mt-1">Atribuído a: ${assignedName}</p>
            </div>
            <div class="flex gap-2">
                <button data-id="${goal.id}" data-action="edit" class="btn btn-sm btn-secondary">
                    <i class="fas fa-pencil-alt"></i>
                </button>
                <button data-id="${goal.id}" data-action="delete" class="btn btn-sm btn-danger">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `}).join('');
}

/**
 * Limpa o formulário e o retorna ao modo de "adição".
 * @param {HTMLFormElement} form - O elemento do formulário.
 */
function resetForm(form) {
    form.reset();
    currentEditingGoalId = null;
    form.querySelector('button[type="submit"]').textContent = "Adicionar Meta";
}