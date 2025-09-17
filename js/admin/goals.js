// js/admin/goals.js (Módulo para Gerenciar Metas de Vendas - VERSÃO ATUALIZADA)

import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let db;
let getGlobalData;
let currentEditingGoalId = null; // Variável para controlar a edição

/**
 * Inicializa o módulo de gerenciamento de metas de vendas.
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
 * Popula o seletor de atribuição de metas com os usuários.
 */
function populateUserSelect() {
    const select = document.getElementById('goal-assign');
    if (!select) return;

    const { users } = getGlobalData();
    const employees = users.filter(u => u.role !== 'admin');
    
    // Guarda o valor selecionado para não o perder ao recarregar
    const selectedValue = select.value;

    select.innerHTML = '<option value="">Selecione um funcionário</option>'; // Opção padrão
    select.innerHTML += employees.map(user => 
        `<option value="${user.id}">${user.nomeFantasia}</option>`
    ).join('');

    select.value = selectedValue;
}


/**
 * Configura os listeners de eventos para o formulário de metas.
 */
function setupEventListeners() {
    const form = document.getElementById('sales-goal-form');
    form?.addEventListener('submit', handleAddOrUpdateSalesGoal);

    const listContainer = document.getElementById('sales-goal-list');
    listContainer?.addEventListener('click', handleListActions);
}

/**
 * Manipula o envio do formulário para ADICIONAR ou ATUALIZAR uma meta.
 */
async function handleAddOrUpdateSalesGoal(e) {
    e.preventDefault();
    const form = e.target;
    const assignedTo = form.querySelector('#goal-assign').value;
    const category = form.querySelector('#goal-category').value;
    const quantityMin = parseInt(form.querySelector('#goal-quantity-min').value, 10);
    const quantityMax = parseInt(form.querySelector('#goal-quantity-max').value, 10);
    const bonus = parseFloat(form.querySelector('#goal-bonus').value);

    if (!assignedTo || !category || isNaN(quantityMin) || isNaN(quantityMax) || isNaN(bonus)) {
        alert("Por favor, preencha todos os campos com valores válidos.");
        return;
    }
    if (quantityMin > quantityMax) {
        return alert("A quantidade mínima não pode ser maior que a máxima.");
    }
    
    const description = `Vender de ${quantityMin} a ${quantityMax} produtos (${category}) para ganhar R$${bonus.toFixed(2)}`;

    const goalData = {
        assignedTo,
        category,
        quantityMin,
        quantityMax,
        bonus,
        description,
    };

    try {
        if (currentEditingGoalId) {
            // Atualizando uma meta existente
            const goalRef = doc(db, "salesGoals", currentEditingGoalId);
            await updateDoc(goalRef, goalData);
            alert("Meta atualizada com sucesso!");
        } else {
            // Criando uma nova meta
            goalData.createdAt = new Date();
            await addDoc(collection(db, "salesGoals"), goalData);
        }
        form.reset();
        currentEditingGoalId = null; // Reseta o modo de edição
        document.querySelector('#sales-goal-form button[type="submit"]').textContent = "Adicionar Meta";

    } catch (error) {
        console.error("Erro ao salvar meta de vendas:", error);
        alert("Ocorreu um erro ao salvar a meta.");
    }
}

/**
 * Manipula os cliques nos botões de editar e apagar na lista de metas.
 */
async function handleListActions(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const { action, id } = button.dataset;
    
    if (action === 'delete') {
        if (confirm("Tem certeza que deseja apagar esta meta de vendas?")) {
            try {
                await deleteDoc(doc(db, "salesGoals", id));
            } catch (error) {
                console.error("Erro ao apagar meta:", error);
                alert("Ocorreu um erro ao apagar a meta.");
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
 */
function populateFormForEdit(goal) {
    currentEditingGoalId = goal.id;
    document.getElementById('goal-assign').value = goal.assignedTo;
    document.getElementById('goal-category').value = goal.category;
    document.getElementById('goal-quantity-min').value = goal.quantityMin;
    document.getElementById('goal-quantity-max').value = goal.quantityMax;
    document.getElementById('goal-bonus').value = goal.bonus;
    
    document.querySelector('#sales-goal-form button[type="submit"]').textContent = "Salvar Alterações";
    window.scrollTo(0, document.getElementById('sales-goal-form').offsetTop);
}

/**
 * Escuta as mudanças na coleção de metas e renderiza a lista.
 */
function listenToSalesGoals() {
    const q = collection(db, "salesGoals");
    onSnapshot(q, (snapshot) => {
        const goals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        window.salesGoals = goals; // Torna acessível globalmente para getGlobalData
        renderSalesGoalList(goals);
    });
}

/**
 * Renderiza a lista de metas de vendas existentes.
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