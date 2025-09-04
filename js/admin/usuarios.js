// js/admin/usuarios.js (Módulo de Administração de Usuários)

import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let db;
let getAllUsers;
const auth = getAuth(); // Pega a instância de auth já inicializada

// Função de inicialização chamada pelo admin.js
export function initUsuariosAdmin(firestore, usersFunc) {
    db = firestore;
    getAllUsers = usersFunc;
    
    console.log("Módulo de Admin de Usuários inicializado.");
    
    setupUsuariosEventListeners();
    updateUserListUI();

    // Ouve o evento personalizado para atualizar a lista quando os dados mudam
    window.addEventListener('usersUpdated', updateUserListUI);
}

function setupUsuariosEventListeners() {
    document.getElementById('createUserForm')?.addEventListener('submit', handleCreateUser);
    
    // Listener para os botões de editar na lista
    document.getElementById('userList')?.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action="edit-user"]');
        if (button) {
            const user = getAllUsers().find(u => u.uid === button.dataset.userId);
            if (user) openEditUserModal(user);
        }
    });

    // Listeners do modal de edição
    document.getElementById('editUserForm')?.addEventListener('submit', handleEditUser);
    document.getElementById('cancelEditUser')?.addEventListener('click', () => {
        document.getElementById('editUserModal').classList.add('hidden');
    });
}

function updateUserListUI() {
    const userListEl = document.getElementById('userList');
    if(!userListEl) return;
    
    userListEl.innerHTML = '';
    getAllUsers().forEach(user => {
        userListEl.innerHTML += `
            <div class="user-item">
                <div>
                    <div class="font-semibold text-sm">${user.nomeFantasia} (${user.role || 'vendedor'})</div>
                    <div class.text-xs text-gray-400">${user.email}</div>
                    <div class="text-xs text-gray-400">Salário: R$ ${(user.salarioFixo || 0).toFixed(2)}</div>
                </div>
                <button data-action="edit-user" data-user-id="${user.uid}" class="btn btn-sm btn-secondary">
                    <i class="fas fa-pencil-alt"></i>
                </button>
            </div>
        `;
    });
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

    if (password.length < 6) {
        alert("A senha precisa ter no mínimo 6 caracteres.");
        return;
    }

    try {
        // 1. Cria o usuário na autenticação do Firebase
        // ATENÇÃO: A criação de usuários no cliente pode deslogar o admin temporariamente.
        // O ideal para produção é usar Firebase Functions (backend).
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Cria o documento do usuário no Firestore
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: email,
            nomeFantasia: nome,
            nomeFantasia_lower: nome.toLowerCase(),
            role: role,
            salarioFixo: salario,
            horarioEntrada1: entrada1,
            horarioSaida1: saida1,
            horarioEntrada2: entrada2,
            horarioSaida2: saida2
        });

        alert(`Usuário ${nome} criado com sucesso!`);
        form.reset();

    } catch (error) {
        console.error("Erro ao criar usuário:", error);
        alert("Erro ao criar usuário: " + error.message);
    }
}

function openEditUserModal(user) {
    const modal = document.getElementById('editUserModal');
    if (!modal) return;

    modal.querySelector('#editUserId').value = user.uid;
    modal.querySelector('#editNome').value = user.nomeFantasia;
    modal.querySelector('#editRole').value = user.role || 'vendedor';
    modal.querySelector('#editSalario').value = user.salarioFixo || 0;
    modal.querySelector('#editEntrada1').value = user.horarioEntrada1 || '';
    modal.querySelector('#editSaida1').value = user.horarioSaida1 || '';
    modal.querySelector('#editEntrada2').value = user.horarioEntrada2 || '';
    modal.querySelector('#editSaida2').value = user.horarioSaida2 || '';
    
    modal.classList.remove('hidden');
}

async function handleEditUser(e) {
    e.preventDefault();
    const form = e.target;
    const uid = form.querySelector('#editUserId').value;
    if (!uid) return;
    
    const updatedData = {
        nomeFantasia: form.querySelector('#editNome').value,
        role: form.querySelector('#editRole').value,
        salarioFixo: parseFloat(form.querySelector('#editSalario').value),
        horarioEntrada1: form.querySelector('#editEntrada1').value,
        horarioSaida1: form.querySelector('#editSaida1').value,
        horarioEntrada2: form.querySelector('#editEntrada2').value || null,
        horarioSaida2: form.querySelector('#editSaida2').value || null,
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