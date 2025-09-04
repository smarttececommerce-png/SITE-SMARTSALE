// js/admin/ponto.js (Módulo de Administração do Ponto Eletrônico)

import { doc, getDoc, updateDoc, getDocs, query, collection, where, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let db;
let getAllUsers;
let getAllPontoRecords;
let getAllAbsences;
let getPontoConfig;
let currentDeleteAction = null;

let calendarState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
};

// Função de inicialização exportada, chamada pelo admin.js
export function initPontoAdmin(firestore, usersFunc, recordsFunc, absencesFunc, configFunc) {
    db = firestore;
    getAllUsers = usersFunc;
    getAllPontoRecords = recordsFunc;
    getAllAbsences = absencesFunc;
    getPontoConfig = configFunc;
    
    console.log("Módulo de Admin do Ponto inicializado.");
    
    setupPontoEventListeners();
    updatePontoUI();

    // Adiciona listeners para atualizar a UI quando os dados compartilhados mudam
    window.addEventListener('pontoRecordsUpdated', updatePontoUI);
    window.addEventListener('usersUpdated', populateUserSelects);
    window.addEventListener('absencesUpdated', displayAbsences);
}

function setupPontoEventListeners() {
    document.getElementById('generateReportBtn')?.addEventListener('click', generatePontoReport);
    document.getElementById('calendar-prev-month')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('calendar-next-month')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('calendar-user-select')?.addEventListener('change', renderCalendar);
    document.getElementById('pendingJustifications')?.addEventListener('click', handleJustificationAction);
    document.getElementById('savePontoSettings')?.addEventListener('click', savePontoSettings);
    document.getElementById('createAbsenceForm')?.addEventListener('submit', handleCreateAbsence);
    
    document.getElementById('absenceList')?.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (button && button.dataset.action === 'delete-absence') {
            confirmDeleteAbsence(button.dataset.id);
        }
    });

    document.getElementById('confirmDelete')?.addEventListener('click', () => {
        if (currentDeleteAction) currentDeleteAction();
        document.getElementById('confirmDeleteModal').classList.add('hidden');
    });
    document.getElementById('cancelDelete')?.addEventListener('click', () => {
        document.getElementById('confirmDeleteModal').classList.add('hidden');
    });
}

// Função central que chama todas as atualizações de UI
function updatePontoUI() {
    populateUserSelects();
    updatePendingJustifications();
    renderCalendar();
    displayPontoSettings();
    displayAbsences();
}

function populateUserSelects() {
    const userSelectors = document.querySelectorAll('#reportUser, #calendar-user-select, #absenceAppliesTo');
    const users = getAllUsers();
    userSelectors.forEach(select => {
        if (!select) return;
        const oldValue = select.value;
        const firstOption = select.options[0]?.cloneNode(true);
        select.innerHTML = '';
        if(firstOption && (firstOption.value === 'todos' || firstOption.value === '')) {
            select.appendChild(firstOption);
        }

        users.forEach(user => {
            if(user.role !== 'admin') {
                const option = document.createElement('option');
                option.value = user.uid;
                option.textContent = user.nomeFantasia;
                select.appendChild(option);
            }
        });
        select.value = oldValue;
    });
}

function displayPontoSettings() {
    const config = getPontoConfig();
    const toleranciaEl = document.getElementById('tolerancia');
    const bonusEl = document.getElementById('punctualityBonusValue');
    if (toleranciaEl) toleranciaEl.value = config.toleranciaMinutos || 5;
    if (bonusEl) bonusEl.value = config.punctualityBonusValue || 50;
}

async function savePontoSettings() {
    const newConfig = {
        toleranciaMinutos: parseInt(document.getElementById('tolerancia').value),
        punctualityBonusValue: parseFloat(document.getElementById('punctualityBonusValue').value)
    };
    const saveBtn = document.getElementById('savePontoSettings');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';
    try {
        await setDoc(doc(db, "configuracaoPonto", "default"), newConfig, { merge: true });
        saveBtn.textContent = 'Salvo!';
        saveBtn.classList.add('bg-green-600');
        setTimeout(() => {
            saveBtn.textContent = 'Salvar Configurações';
            saveBtn.classList.remove('bg-green-600');
            saveBtn.disabled = false;
        }, 2000);
    } catch (error) {
        console.error("Erro ao salvar configurações:", error);
        alert("Erro ao salvar.");
        saveBtn.textContent = 'Salvar Configurações';
        saveBtn.disabled = false;
    }
}

function displayAbsences() {
    const listEl = document.getElementById('absenceList');
    if(!listEl) return;
    listEl.innerHTML = '';
    getAllAbsences().forEach(absence => {
        listEl.innerHTML += `
            <li class="flex justify-between items-center text-sm p-2 bg-gray-700 rounded">
                <span>${new Date(absence.date + 'T03:00:00Z').toLocaleDateString('pt-BR')} - ${absence.description}</span>
                <button data-action="delete-absence" data-id="${absence.id}" class="text-red-400 hover:text-red-500 font-bold text-lg">&times;</button>
            </li>
        `;
    });
}

async function handleCreateAbsence(e) {
    e.preventDefault();
    const form = e.target;
    const date = form.querySelector('#absenceDate').value;
    const description = form.querySelector('#absenceDescription').value;
    const appliesTo = form.querySelector('#absenceAppliesTo').value;
    try {
        const id = `${date}-${appliesTo}`;
        await setDoc(doc(db, "ausencias", id), { date, description, appliesTo });
        form.reset();
    } catch(error) {
        console.error("Erro ao criar ausência:", error);
        alert("Erro ao criar ausência.");
    }
}

function confirmDeleteAbsence(id) {
    showConfirmDeleteModal(`Tem certeza que deseja remover esta ausência?`, async () => {
        await deleteDoc(doc(db, "ausencias", id));
    });
}

function showConfirmDeleteModal(message, onConfirm) {
    document.getElementById('confirmDeleteText').textContent = message;
    currentDeleteAction = onConfirm;
    document.getElementById('confirmDeleteModal').classList.remove('hidden');
}

function updatePendingJustifications() {
    const container = document.getElementById('pendingJustifications');
    if (!container) return;
    const pending = getAllPontoRecords().filter(r => r.justificativa && r.aprovadoPorAdm === false).sort((a, b) => new Date(a.data.seconds * 1000) - new Date(b.data.seconds * 1000));
    container.innerHTML = '';
    if (pending.length === 0) {
        container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center">Nenhuma justificativa pendente.</p>';
        return;
    }
    pending.forEach(record => {
        const user = getAllUsers().find(u => u.uid === record.employeeId);
        const recordDate = new Date(record.data.seconds * 1000).toLocaleDateString('pt-BR');
        container.innerHTML += `<div class="p-3 bg-yellow-900/50 rounded-lg border border-yellow-800 pending-item" data-record-id="${record.id}" data-employee-id="${record.employeeId}"><p class="font-semibold text-sm">${user ? user.nomeFantasia : 'ID desconhecido'} - ${recordDate}</p><p class="text-xs text-gray-300 my-1">"${record.justificativa}"</p><div class="flex justify-end space-x-2 mt-2"><button data-action="approve" class="btn btn-sm bg-green-600 hover:bg-green-700 text-white">Aprovar</button><button data-action="reject" class="btn btn-sm bg-red-600 hover:bg-red-700 text-white">Rejeitar</button></div></div>`;
    });
}

// CORREÇÃO APLICADA AQUI
async function handleJustificationAction(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const action = button.dataset.action;
    const pendingItem = button.closest('.pending-item');
    const { recordId, employeeId } = pendingItem.dataset;
    const docRef = doc(db, "registrosPonto", `${employeeId}_${recordId}`);

    // Desabilita os botões para evitar cliques duplos
    pendingItem.querySelectorAll('button').forEach(btn => btn.disabled = true);

    try {
        const recordSnap = await getDoc(docRef);
        if (!recordSnap.exists()) throw new Error("Registro não encontrado!");
        
        const recordData = recordSnap.data();
        let updateData = {};

        if (recordData.status === 'falta_justificada') {
            if (action === 'approve') {
                updateData = { aprovadoPorAdm: true, status: 'falta_abonada' };
            } else { // reject
                 // Em vez de deletar, marcamos como rejeitada para manter o histórico
                updateData = { aprovadoPorAdm: null, justificativa: `${recordData.justificativa} (Rejeitada)` };
            }
        } else { // Justificativa de atraso ou saída antecipada
            if (action === 'approve') {
                updateData = { aprovadoPorAdm: true, valorDesconto: 0 };
            } else { // reject
                updateData = { aprovadoPorAdm: null, justificativa: `${recordData.justificativa} (Rejeitada)` };
            }
        }
        await updateDoc(docRef, updateData);
        
        // A lógica de atualização em tempo real do admin.js irá cuidar de redesenhar a lista.
        // Se a atualização não for imediata, podemos forçar aqui:
        // updatePendingJustifications();

    } catch (error) {
        console.error("Erro ao processar justificativa:", error);
        alert('Erro ao processar justificativa.');
        // Reabilita os botões em caso de erro
        pendingItem.querySelectorAll('button').forEach(btn => btn.disabled = false);
    }
}

function changeMonth(direction) {
    let date = new Date(calendarState.year, calendarState.month);
    date.setMonth(date.getMonth() + direction);
    calendarState.year = date.getFullYear();
    calendarState.month = date.getMonth();
    renderCalendar();
}

function renderCalendar() {
    const userSelect = document.getElementById('calendar-user-select');
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('calendar-month-year');
    if (!userSelect || !grid || !title) return;
    const selectedUserId = userSelect.value;
    grid.innerHTML = '';
    const currentDate = new Date(calendarState.year, calendarState.month);
    title.textContent = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    for (let i = 0; i < firstDayOfMonth; i++) {
        grid.appendChild(document.createElement('div'));
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        const date = new Date(calendarState.year, calendarState.month, day);
        cell.innerHTML = `<div class="cal-day">${day}</div>`;
        if (date.toDateString() === new Date().toDateString()) {
            cell.classList.add('today');
        }
        if (selectedUserId) {
            const record = getAllPontoRecords().find(r => r.employeeId === selectedUserId && new Date(r.data.seconds * 1000).toDateString() === date.toDateString());
            if (record) {
                const statusDot = document.createElement('div');
                statusDot.className = 'absolute bottom-1.5 h-1.5 w-1.5 rounded-full';
                if (record.status && record.status.startsWith('completo')) statusDot.classList.add('bg-green-500');
                else if (record.minutosAtrasado > 0) statusDot.classList.add('bg-red-500');
                else if (record.status === 'falta_justificada') statusDot.classList.add('bg-yellow-500');
                else if (record.status === 'falta_abonada') statusDot.classList.add('bg-blue-500');
                cell.appendChild(statusDot);
            }
        }
        cell.addEventListener('click', () => showRecordDetails(date));
        grid.appendChild(cell);
    }
}

async function showRecordDetails(date) {
    const detailsArea = document.getElementById('calendar-record-details');
    const selectedUserId = document.getElementById('calendar-user-select').value;
    if (!selectedUserId) {
        detailsArea.innerHTML = `<p class="text-center text-yellow-400">Selecione um funcionário para ver os detalhes.</p>`;
        detailsArea.classList.remove('hidden');
        return;
    }
    detailsArea.classList.remove('hidden');
    detailsArea.innerHTML = `<p class="text-center text-gray-400">Carregando...</p>`;

    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const recordId = `${selectedUserId}_${dateStr}`;
    const recordRef = doc(db, "registrosPonto", recordId);
    const docSnap = await getDoc(recordRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        detailsArea.innerHTML = `
            <h4 class="font-bold">Detalhes do Dia: ${date.toLocaleDateString('pt-BR')}</h4>
            <div class="text-sm mt-2 space-y-1">
                <p><strong>Status:</strong> ${data.status || 'N/A'}</p>
                <p><strong>Entrada:</strong> ${data.entrada ? new Date(data.entrada).toLocaleTimeString('pt-BR') : '--:--'}</p>
                <p><strong>Saída:</strong> ${data.saida ? new Date(data.saida).toLocaleTimeString('pt-BR') : '--:--'}</p>
                <p><strong>Justificativa:</strong> ${data.justificativa || 'Nenhuma'}</p>
            </div>
        `;
    } else {
        detailsArea.innerHTML = `
            <h4 class="font-bold">Detalhes do Dia: ${date.toLocaleDateString('pt-BR')}</h4>
            <p class="text-center text-gray-400 mt-2">Nenhum registro encontrado.</p>
        `;
    }
}

async function generatePontoReport() {
    // Implementação da geração de relatórios
    alert("Gerando relatório...");
} 