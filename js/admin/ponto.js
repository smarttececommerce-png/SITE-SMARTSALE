// js/admin/ponto.js (Módulo de Administração do Ponto Eletrônico - CORRIGIDO)

import { doc, getDoc, updateDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let db;
let getGlobalData;
let currentDeleteAction = null;

let calendarState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
};

/**
 * Inicializa o módulo de administração do Ponto Eletrônico.
 * @param {object} firestoreInstance - A instância do Firestore.
 * @param {function} globalDataGetter - Função para obter dados globais.
 */
export function initPontoAdmin(firestoreInstance, globalDataGetter) {
    db = firestoreInstance;
    getGlobalData = globalDataGetter;
    
    console.log("Módulo de Admin do Ponto inicializado.");
    
    setupPontoEventListeners();
    updatePontoUI();

    // Ouve o evento de atualização de dados para redesenhar a UI
    window.addEventListener('dataUpdated', (e) => {
        if (e.detail.dataType === 'ponto' || e.detail.dataType === 'users' || e.detail.dataType === 'absences') {
            updatePontoUI();
        }
    });
}

function setupPontoEventListeners() {
    document.getElementById('generateReportBtn')?.addEventListener('click', () => alert("Função de relatório ainda não implementada."));
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

/**
 * Popula os selects de usuário na interface.
 */
function populateUserSelects() {
    const userSelectors = document.querySelectorAll('#reportUser, #calendar-user-select, #absenceAppliesTo');
    
    // **CORREÇÃO APLICADA AQUI**
    // Extrai a lista de usuários do objeto retornado por getGlobalData
    const { users } = getGlobalData();
    if (!users || !Array.isArray(users)) {
        console.error("A lista de usuários não é um array válido.");
        return;
    }

    userSelectors.forEach(select => {
        if (!select) return;
        const oldValue = select.value;
        const firstOption = select.options[0]?.cloneNode(true);
        select.innerHTML = '';
        if (firstOption && (firstOption.value === 'todos' || firstOption.value === '')) {
            select.appendChild(firstOption);
        }

        users.forEach(user => { // Agora 'users' é garantidamente um array
            if (user.role !== 'admin') {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.nomeFantasia;
                select.appendChild(option);
            }
        });
        select.value = oldValue;
    });
}


function displayPontoSettings() {
    // Implementação futura ou buscar de um objeto de config
    const config = { toleranciaMinutos: 5, punctualityBonusValue: 50 }; // Exemplo
    const toleranciaEl = document.getElementById('tolerancia');
    const bonusEl = document.getElementById('punctualityBonusValue');
    if (toleranciaEl) toleranciaEl.value = config.toleranciaMinutos;
    if (bonusEl) bonusEl.value = config.punctualityBonusValue;
}

async function savePontoSettings() {
    const newConfig = {
        toleranciaMinutos: parseInt(document.getElementById('tolerancia').value, 10),
        punctualityBonusValue: parseFloat(document.getElementById('punctualityBonusValue').value)
    };
    const saveBtn = document.getElementById('savePontoSettings');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';
    try {
        await setDoc(doc(db, "configuracaoPonto", "default"), newConfig, { merge: true });
        saveBtn.textContent = 'Salvo!';
        setTimeout(() => {
            saveBtn.textContent = 'Salvar Configurações';
            saveBtn.disabled = false;
        }, 2000);
    } catch (error) {
        console.error("Erro ao salvar configurações:", error);
        saveBtn.textContent = 'Salvar Configurações';
        saveBtn.disabled = false;
    }
}

function displayAbsences() {
    const listEl = document.getElementById('absenceList');
    if(!listEl) return;
    const { absences } = getGlobalData();
    listEl.innerHTML = absences.length > 0 ? absences.map(absence => `
        <li class="flex justify-between items-center text-sm p-2 bg-gray-700 rounded">
            <span>${new Date(absence.date + 'T03:00:00Z').toLocaleDateString('pt-BR')} - ${absence.description}</span>
            <button data-action="delete-absence" data-id="${absence.id}" class="text-red-400 hover:text-red-500 font-bold text-lg">&times;</button>
        </li>
    `).join('') : '';
}

async function handleCreateAbsence(e) {
    e.preventDefault();
    const form = e.target;
    const date = form.querySelector('#absenceDate').value;
    const description = form.querySelector('#absenceDescription').value;
    const appliesTo = form.querySelector('#absenceAppliesTo').value;
    try {
        const id = `${date}-${appliesTo}`;
        await setDoc(doc(db, "generalAbsences", id), { date, description, appliesTo });
        form.reset();
    } catch(error) {
        console.error("Erro ao criar ausência:", error);
        alert("Erro ao criar ausência.");
    }
}

function confirmDeleteAbsence(id) {
    showConfirmDeleteModal(`Tem certeza que deseja remover esta ausência?`, async () => {
        await deleteDoc(doc(db, "generalAbsences", id));
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
    const { pontoRecords, users } = getGlobalData();
    const pending = pontoRecords.filter(r => r.justificativa && r.aprovadoPorAdm === false).sort((a, b) => (b.data.seconds || 0) - (a.data.seconds || 0));
    
    if (pending.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center">Nenhuma justificativa pendente.</p>';
        return;
    }

    const userMap = new Map(users.map(u => [u.id, u.nomeFantasia]));
    container.innerHTML = pending.map(record => {
        const userName = userMap.get(record.employeeId) || 'ID desconhecido';
        const recordDate = new Date((record.data.seconds || 0) * 1000).toLocaleDateString('pt-BR');
        return `
        <div class="p-3 bg-yellow-900/50 rounded-lg border border-yellow-800 pending-item" data-record-id="${record.id}" data-employee-id="${record.employeeId}">
            <p class="font-semibold text-sm">${userName} - ${recordDate}</p>
            <p class="text-xs text-gray-300 my-1">"${record.justificativa}"</p>
            <div class="flex justify-end space-x-2 mt-2">
                <button data-action="approve" class="btn btn-sm bg-green-600 hover:bg-green-700 text-white">Aprovar</button>
                <button data-action="reject" class="btn btn-sm bg-red-600 hover:bg-red-700 text-white">Rejeitar</button>
            </div>
        </div>`;
    }).join('');
}

async function handleJustificationAction(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const action = button.dataset.action;
    const pendingItem = button.closest('.pending-item');
    const { recordId } = pendingItem.dataset;

    const docRef = doc(db, "registrosPonto", recordId);
    pendingItem.querySelectorAll('button').forEach(btn => btn.disabled = true);

    try {
        const recordSnap = await getDoc(docRef);
        if (!recordSnap.exists()) throw new Error("Registro não encontrado!");
        
        let updateData;
        if (action === 'approve') {
            updateData = { aprovadoPorAdm: true };
        } else { // reject
            updateData = { aprovadoPorAdm: null, justificativa: `(Rejeitada) ${recordSnap.data().justificativa}` };
        }
        await updateDoc(docRef, updateData);
    } catch (error) {
        console.error("Erro ao processar justificativa:", error);
        alert('Erro ao processar justificativa.');
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

    const { pontoRecords } = getGlobalData();

    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        const date = new Date(calendarState.year, calendarState.month, day);
        cell.innerHTML = `<div class="cal-day">${day}</div>`;
        if (date.toDateString() === new Date().toDateString()) {
            cell.classList.add('today');
        }
        if (selectedUserId) {
            const record = pontoRecords.find(r => r.employeeId === selectedUserId && new Date((r.data.seconds || 0) * 1000).toDateString() === date.toDateString());
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
        detailsArea.innerHTML = `<p class="text-center text-yellow-400">Selecione um funcionário.</p>`;
        detailsArea.classList.remove('hidden');
        return;
    }
    detailsArea.classList.remove('hidden');
    detailsArea.innerHTML = `<p class="text-center text-gray-400">Carregando...</p>`;

    const { pontoRecords } = getGlobalData();
    const record = pontoRecords.find(r => r.employeeId === selectedUserId && new Date((r.data.seconds || 0) * 1000).toDateString() === date.toDateString());

    if (record) {
        detailsArea.innerHTML = `
            <h4 class="font-bold">Detalhes do Dia: ${date.toLocaleDateString('pt-BR')}</h4>
            <div class="text-sm mt-2 space-y-1">
                <p><strong>Status:</strong> ${record.status || 'N/A'}</p>
                <p><strong>Entrada:</strong> ${record.entrada ? new Date(record.entrada).toLocaleTimeString('pt-BR') : '--:--'}</p>
                <p><strong>Saída:</strong> ${record.saida ? new Date(record.saida).toLocaleTimeString('pt-BR') : '--:--'}</p>
                <p><strong>Justificativa:</strong> ${record.justificativa || 'Nenhuma'}</p>
            </div>
        `;
    } else {
        detailsArea.innerHTML = `
            <h4 class="font-bold">Detalhes do Dia: ${date.toLocaleDateString('pt-BR')}</h4>
            <p class="text-center text-gray-400 mt-2">Nenhum registro encontrado.</p>
        `;
    }
}