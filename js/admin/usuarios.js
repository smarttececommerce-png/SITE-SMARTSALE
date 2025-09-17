// js/admin/usuarios.js (Módulo de Administração de Usuários - CORRIGIDO)

import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let db;
let getGlobalData;
const auth = getAuth();

// Array para ajudar a renderizar os checkboxes dos dias da semana
const weekDays = [
    { label: 'D', value: 0 }, { label: 'S', value: 1 },
    { label: 'T', value: 2 }, { label: 'Q', value: 3 },
    { label: 'Q', value: 4 }, { label: 'S', value: 5 },
    { label: 'S', value: 6 }
];

/**
 * Controla a visibilidade dos campos de horário de Sábado.
 * @param {string} containerId - O ID do container dos dias da semana (ex: 'createWorkDays').
 * @param {string} scheduleId - O ID do container do horário de Sábado (ex: 'createSaturdaySchedule').
 */
function toggleSaturdaySchedule(containerId, scheduleId) {
    const saturdayCheckbox = document.querySelector(`#${containerId}-6`); // Sábado é o valor 6
    const scheduleContainer = document.getElementById(scheduleId);

    if (saturdayCheckbox && scheduleContainer) {
        scheduleContainer.classList.toggle('hidden', !saturdayCheckbox.checked);
    }
}


/**
 * Renderiza os checkboxes dos dias da semana em um container específico.
 * @param {string} containerId - O ID do elemento div onde os checkboxes serão inseridos.
 * @param {string} scheduleId - O ID do container do horário de Sábado associado.
 * @param {Array<number>} [userDays=[1, 2, 3, 4, 5]] - Os dias que devem vir pré-selecionados.
 */
function renderWorkDays(containerId, scheduleId, userDays = [1, 2, 3, 4, 5]) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = weekDays.map(day => `
        <div>
            <input type="checkbox" id="${containerId}-${day.value}" value="${day.value}" class="hidden day-checkbox-input" ${userDays.includes(day.value) ? 'checked' : ''}>
            <label for="${containerId}-${day.value}" class="day-checkbox-label">${day.label}</label>
        </div>
    `).join('');

    // Adiciona o listener para o checkbox de sábado
    const saturdayCheckbox = document.querySelector(`#${containerId}-6`);
    if (saturdayCheckbox) {
        saturdayCheckbox.addEventListener('change', () => toggleSaturdaySchedule(containerId, scheduleId));
    }
    
    // Verifica o estado inicial
    toggleSaturdaySchedule(containerId, scheduleId);
}

/**
 * Inicializa o módulo de administração de Usuários.
 * @param {object} firestoreInstance - A instância do Firestore.
 * @param {function} globalDataGetter - Função para obter dados globais.
 */
export function initUsuariosAdmin(firestoreInstance, globalDataGetter) {
    db = firestoreInstance;
    getGlobalData = globalDataGetter;
    
    console.log("Módulo de Admin de Usuários inicializado.");
    
    setupUsuariosEventListeners();
    updateUserListUI();
    renderWorkDays('createWorkDays', 'createSaturdaySchedule'); // Renderiza os dias no formulário de criação

    window.addEventListener('dataUpdated', (e) => {
        if (e.detail.dataType === 'users') {
            updateUserListUI();
        }
    });
}

function setupUsuariosEventListeners() {
    document.getElementById('createUserForm')?.addEventListener('submit', handleCreateUser);
    
    document.getElementById('userList')?.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-user-id]');
        if (!button) return;

        const userId = button.dataset.userId;
        const action = button.dataset.action;
        const { users } = getGlobalData();
        const user = users.find(u => u.id === userId);

        if (action === 'edit-user' && user) {
            openEditUserModal(user);
        }
    });

    document.getElementById('editUserForm')?.addEventListener('submit', handleEditUser);
    document.getElementById('cancelEditUser')?.addEventListener('click', () => {
        document.getElementById('editUserModal').classList.add('hidden');
    });
}

function updateUserListUI() {
    const userListEl = document.getElementById('userList');
    if (!userListEl) return;
    
    const { users } = getGlobalData();
    if (!users || !Array.isArray(users)) {
        userListEl.innerHTML = '';
        return;
    }
    
    const usersToList = users.filter(user => user.id !== auth.currentUser.uid);

    if (usersToList.length === 0) {
        userListEl.innerHTML = '<p class="text-gray-400 italic">Nenhum outro usuário cadastrado.</p>';
        return;
    }

    userListEl.innerHTML = usersToList.map(user => `
        <div class="user-item">
            <div>
                <p class="font-semibold text-white">${user.nomeFantasia} <span class="text-xs text-gray-400">(${user.role || 'vendedor'})</span></p>
                <p class="text-xs text-gray-400">${user.email}</p>
                <p class="text-xs text-gray-400">Salário: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(user.salarioFixo || 0)}</p>
            </div>
            <div class="flex items-center gap-2">
                <button data-action="edit-user" data-user-id="${user.id}" class="btn btn-sm btn-secondary">
                    <i class="fas fa-pencil-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function handleCreateUser(e) {
    e.preventDefault();
    const form = e.target;
    const nome = form.querySelector('#createNome').value;
    const email = form.querySelector('#createEmail').value;
    const password = form.querySelector('#createPassword').value;
    const role = form.querySelector('#createRole').value;
    const salario = parseFloat(form.querySelector('#createSalario').value);
    const entrada1 = form.querySelector('#createEntrada1').value;
    const saida1 = form.querySelector('#createSaida1').value;
    const entrada2 = form.querySelector('#createEntrada2').value || null;
    const saida2 = form.querySelector('#createSaida2').value || null;
    const entradaSabado = form.querySelector('#createEntradaSabado').value || null;
    const saidaSabado = form.querySelector('#createSaidaSabado').value || null;
    
    const workDays = [];
    form.querySelectorAll('#createWorkDays input:checked').forEach(input => {
        workDays.push(parseInt(input.value));
    });

    if (password.length < 6) {
        alert("A senha precisa ter no mínimo 6 caracteres.");
        return;
    }
    if (workDays.length === 0) {
        alert("Selecione pelo menos um dia de trabalho.");
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
            email: email,
            nomeFantasia: nome,
            nomeFantasia_lower: nome.toLowerCase(),
            role: role,
            salarioFixo: salario,
            horarioEntrada1: entrada1,
            horarioSaida1: saida1,
            horarioEntrada2: entrada2,
            horarioSaida2: saida2,
            horarioEntradaSabado: entradaSabado,
            horarioSaidaSabado: saidaSabado,
            diasTrabalho: workDays 
        });

        alert(`Usuário ${nome} criado com sucesso!`);
        form.reset();
        renderWorkDays('createWorkDays', 'createSaturdaySchedule');

    } catch (error) {
        console.error("Erro ao criar usuário:", error);
        alert("Erro ao criar usuário: " + error.message);
    }
}

function openEditUserModal(user) {
    const modal = document.getElementById('editUserModal');
    if (!modal) return;
    
    renderWorkDays('editWorkDays', 'editSaturdaySchedule', user.diasTrabalho);
    
    modal.querySelector('#editUserId').value = user.id;
    modal.querySelector('#editNome').value = user.nomeFantasia;
    modal.querySelector('#editRole').value = user.role || 'vendedor';
    modal.querySelector('#editSalario').value = user.salarioFixo || 0;
    modal.querySelector('#editEntrada1').value = user.horarioEntrada1 || '';
    modal.querySelector('#editSaida1').value = user.horarioSaida1 || '';
    modal.querySelector('#editEntrada2').value = user.horarioEntrada2 || '';
    modal.querySelector('#editSaida2').value = user.horarioSaida2 || '';
    modal.querySelector('#editEntradaSabado').value = user.horarioEntradaSabado || '';
    modal.querySelector('#editSaidaSabado').value = user.horarioSaidaSabado || '';
    
    modal.classList.remove('hidden');
}

async function handleEditUser(e) {
    e.preventDefault();
    const form = e.target;
    const uid = form.querySelector('#editUserId').value;
    if (!uid) return;
    
    const workDays = [];
    form.querySelectorAll('#editWorkDays input:checked').forEach(input => {
        workDays.push(parseInt(input.value));
    });

    if (workDays.length === 0) {
        alert("Selecione pelo menos um dia de trabalho.");
        return;
    }

    const updatedData = {
        nomeFantasia: form.querySelector('#editNome').value,
        nomeFantasia_lower: form.querySelector('#editNome').value.toLowerCase(),
        role: form.querySelector('#editRole').value,
        salarioFixo: parseFloat(form.querySelector('#editSalario').value),
        horarioEntrada1: form.querySelector('#editEntrada1').value,
        horarioSaida1: form.querySelector('#editSaida1').value,
        horarioEntrada2: form.querySelector('#editEntrada2').value || null,
        horarioSaida2: form.querySelector('#editSaida2').value || null,
        horarioEntradaSabado: form.querySelector('#editEntradaSabado').value || null,
        horarioSaidaSabado: form.querySelector('#editSaidaSabado').value || null,
        diasTrabalho: workDays
    };

    try {
        await updateDoc(doc(db, "users", uid), updatedData);
        alert("Usuário atualizado com sucesso!");
        document.getElementById('editUserModal').classList.add('hidden');
    } catch (error) {
        console.error("Erro ao editar usuário:", error);
        alert("Erro ao editar usuário: " + error.message);
    }
}