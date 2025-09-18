// js/admin/usuarios.js (Módulo de Administração de Utilizadores - REVISADO E MELHORADO)

import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from "../config.js";

let getGlobalData;
const mainAuth = getAuth(); // A autenticação principal da app

// Constante para os dias da semana, para evitar "números mágicos" no código.
const weekDays = [
    { label: 'D', value: 0 }, { label: 'S', value: 1 },
    { label: 'T', value: 2 }, { label: 'Q', value: 3 },
    { label: 'Q', value: 4 }, { label: 'S', value: 5 },
    { label: 'S', value: 6 }
];

/**
 * Inicializa o módulo de administração de Utilizadores.
 * @param {object} firestoreInstance - A instância do Firestore (não utilizada, db é importado).
 * @param {function} globalDataGetter - Função para obter dados globais.
 */
export function initUsuariosAdmin(firestoreInstance, globalDataGetter) {
    getGlobalData = globalDataGetter;
    
    console.log("Módulo de Admin de Utilizadores inicializado.");
    
    setupEventListeners();
    
    // Ouve as atualizações na lista de utilizadores para redesenhar a UI
    window.addEventListener('dataUpdated', (e) => {
        if (e.detail.dataType === 'users') {
            updateUserListUI();
        }
    });
}

/**
 * Configura os listeners de eventos estáticos da secção de utilizadores.
 */
function setupEventListeners() {
    document.getElementById('createUserForm')?.addEventListener('submit', handleCreateUser);
    document.getElementById('editUserForm')?.addEventListener('submit', handleEditUser);
    
    // Botão para fechar o modal de edição
    document.getElementById('cancelEditUser')?.addEventListener('click', () => {
        document.getElementById('editUserModal').classList.add('hidden');
    });

    // Renderiza os checkboxes de dias de trabalho no formulário de criação
    renderWorkDays('createWorkDays', 'createSaturdaySchedule');
}

/**
 * Atualiza a lista de utilizadores na UI.
 */
function updateUserListUI() {
    const userListEl = document.getElementById('userList');
    if (!userListEl) return;
    
    const { users } = getGlobalData();
    if (!users || !Array.isArray(users)) {
        userListEl.innerHTML = '';
        return;
    }
    
    // Filtra para não mostrar o administrador atualmente logado na lista
    const usersToList = users.filter(user => user.id !== mainAuth.currentUser.uid);

    if (usersToList.length === 0) {
        userListEl.innerHTML = '<p class="text-gray-400 italic">Nenhum outro utilizador registado.</p>';
        return;
    }

    userListEl.innerHTML = usersToList.map(user => `
        <div class="user-item">
            <div>
                <p class="font-semibold text-white">${user.nomeFantasia} <span class="text-xs text-gray-400">(${(user.role || 'vendedor')})</span></p>
                <p class="text-xs text-gray-400">${user.email}</p>
                <p class="text-xs text-gray-400">Salário: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(user.salarioFixo || 0)}</p>
            </div>
            <div class="flex items-center gap-2">
                <button data-user-id="${user.id}" class="btn btn-sm btn-secondary edit-user-btn">
                    <i class="fas fa-pencil-alt"></i>
                </button>
            </div>
        </div>
    `).join('');

    // Adiciona os event listeners aos botões de editar recém-criados
    userListEl.querySelectorAll('.edit-user-btn').forEach(button => {
        button.addEventListener('click', () => {
            const userId = button.dataset.userId;
            const userToEdit = users.find(u => u.id === userId);
            if (userToEdit) {
                openEditUserModal(userToEdit);
            }
        });
    });
}


/**
 * Manipula a submissão do formulário de criação de utilizador.
 * @param {Event} e O evento de submissão.
 */
async function handleCreateUser(e) {
    e.preventDefault();
    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');

    const nome = form.querySelector('#createNome').value.trim();
    const email = form.querySelector('#createEmail').value.trim();
    const password = form.querySelector('#createPassword').value;
    const entrada1 = form.querySelector('#createEntrada1').value;
    const saida1 = form.querySelector('#createSaida1').value;

    // Salva as credenciais do admin atual para fazer login novamente depois
    const adminEmail = mainAuth.currentUser.email;
    // Esta é uma abordagem simplificada. Em produção, use senhas seguras ou tokens.
    const adminPassword = prompt(`Para confirmar a criação, por favor, insira a sua senha de administrador:`);
    if (!adminPassword) {
        alert("Criação cancelada. Senha de admin não fornecida.");
        return;
    }


    // Validações
    if (password.length < 6) {
        alert("A palavra-passe precisa de ter no mínimo 6 caracteres.");
        return;
    }
    if (saida1 <= entrada1) {
        alert("O horário de saída principal deve ser posterior ao de entrada.");
        return;
    }

    const workDays = Array.from(form.querySelectorAll('#createWorkDays input:checked')).map(input => parseInt(input.value));
    if (workDays.length === 0) {
        alert("Selecione pelo menos um dia de trabalho.");
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "A criar...";

    try {
        // O Firebase faz login com o novo utilizador automaticamente.
        const userCredential = await createUserWithEmailAndPassword(mainAuth, email, password);
        const user = userCredential.user;

        const userData = {
            email: email,
            nomeFantasia: nome,
            nomeFantasia_lower: nome.toLowerCase(),
            role: form.querySelector('#createRole').value,
            salarioFixo: parseFloat(form.querySelector('#createSalario').value) || 0,
            horarioEntrada1: entrada1,
            horarioSaida1: saida1,
            horarioEntrada2: form.querySelector('#createEntrada2').value || null,
            horarioSaida2: form.querySelector('#createSaida2').value || null,
            horarioEntradaSabado: form.querySelector('#createEntradaSabado').value || null,
            horarioSaidaSabado: form.querySelector('#createSaidaSabado').value || null,
            diasTrabalho: workDays,
            creditoHoras: 0 // Valor inicial
        };

        await setDoc(doc(db, "users", user.uid), userData);

        alert(`Utilizador ${nome} criado com sucesso!`);
        form.reset();
        renderWorkDays('createWorkDays', 'createSaturdaySchedule');

    } catch (error) {
        console.error("Erro ao criar utilizador:", error);
        if (error.code === 'auth/email-already-in-use') {
            alert("Erro: O e-mail fornecido já está a ser utilizado por outra conta.");
        } else {
            alert("Erro ao criar utilizador: " + error.message);
        }
    } finally {
        // Faz login novamente com o admin para restaurar a sessão
        await signInWithEmailAndPassword(mainAuth, adminEmail, adminPassword);
        console.log("Sessão do admin restaurada.");

        submitButton.disabled = false;
        submitButton.textContent = "Criar Utilizador";
    }
}

/**
 * Preenche e abre o modal de edição com os dados do utilizador.
 * @param {object} user O objeto do utilizador a ser editado.
 */
function openEditUserModal(user) {
    const modal = document.getElementById('editUserModal');
    if (!modal) return;
    
    // Preenche o formulário com os dados existentes
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
    
    // Renderiza os dias de trabalho e ajusta a visibilidade do horário de sábado
    renderWorkDays('editWorkDays', 'editSaturdaySchedule', user.diasTrabalho);
    
    modal.classList.remove('hidden');
}

/**
 * Manipula a submissão do formulário de edição de utilizador.
 * @param {Event} e O evento de submissão.
 */
async function handleEditUser(e) {
    e.preventDefault();
    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');
    const uid = form.querySelector('#editUserId').value;
    if (!uid) return;
    
    const workDays = Array.from(form.querySelectorAll('#editWorkDays input:checked')).map(input => parseInt(input.value));
    if (workDays.length === 0) {
        alert("Selecione pelo menos um dia de trabalho.");
        return;
    }

    const updatedData = {
        nomeFantasia: form.querySelector('#editNome').value.trim(),
        nomeFantasia_lower: form.querySelector('#editNome').value.trim().toLowerCase(),
        role: form.querySelector('#editRole').value,
        salarioFixo: parseFloat(form.querySelector('#editSalario').value) || 0,
        horarioEntrada1: form.querySelector('#editEntrada1').value,
        horarioSaida1: form.querySelector('#editSaida1').value,
        horarioEntrada2: form.querySelector('#editEntrada2').value || null,
        horarioSaida2: form.querySelector('#editSaida2').value || null,
        horarioEntradaSabado: form.querySelector('#editEntradaSabado').value || null,
        horarioSaidaSabado: form.querySelector('#editSaidaSabado').value || null,
        diasTrabalho: workDays
    };

    submitButton.disabled = true;
    submitButton.textContent = "A guardar...";

    try {
        await updateDoc(doc(db, "users", uid), updatedData);
        alert("Utilizador atualizado com sucesso!");
        document.getElementById('editUserModal').classList.add('hidden');
    } catch (error) {
        console.error("Erro ao editar utilizador:", error);
        alert("Erro ao editar utilizador: " + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Guardar Alterações";
    }
}


// --- Funções Utilitárias ---

/**
 * Renderiza os checkboxes dos dias da semana num container específico.
 * @param {string} containerId ID do elemento onde os checkboxes serão inseridos.
 * @param {string} scheduleId ID do container do horário de Sábado associado.
 * @param {Array<number>} [userDays=[1,2,3,4,5]] Dias pré-selecionados.
 */
function renderWorkDays(containerId, scheduleId, userDays = [1, 2, 3, 4, 5]) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = weekDays.map(day => `
        <div>
            <input type="checkbox" id="${containerId}-${day.value}" value="${day.value}" class="day-checkbox-input" ${userDays.includes(day.value) ? 'checked' : ''}>
            <label for="${containerId}-${day.value}" class="day-checkbox-label">${day.label}</label>
        </div>
    `).join('');

    const saturdayCheckbox = container.querySelector(`#${containerId}-6`);
    saturdayCheckbox?.addEventListener('change', () => toggleSaturdaySchedule(saturdayCheckbox, scheduleId));
    toggleSaturdaySchedule(saturdayCheckbox, scheduleId); // Verifica o estado inicial
}

/**
 * Controla a visibilidade dos campos de horário de Sábado.
 * @param {HTMLInputElement} checkbox O checkbox de sábado.
 * @param {string} scheduleId ID do container do horário de Sábado.
 */
function toggleSaturdaySchedule(checkbox, scheduleId) {
    const scheduleContainer = document.getElementById(scheduleId);
    if (checkbox && scheduleContainer) {
        scheduleContainer.classList.toggle('hidden', !checkbox.checked);
    }
}