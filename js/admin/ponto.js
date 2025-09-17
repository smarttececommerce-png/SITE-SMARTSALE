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

    window.addEventListener('dataUpdated', (e) => {
        const dataType = e.detail.dataType;
        if (['ponto', 'users', 'absences'].includes(dataType)) {
            updatePontoUI();
        }
        if (dataType === 'config') {
            displayPontoSettings();
        }
    });
}

function setupPontoEventListeners() {
    document.getElementById('generateReportBtn')?.addEventListener('click', generateMonthlyReport);
    document.getElementById('calendar-prev-month')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('calendar-next-month')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('calendar-user-select')?.addEventListener('change', renderCalendar);
    document.getElementById('pendingJustifications')?.addEventListener('click', handleJustificationAction);
    document.getElementById('savePontoSettings')?.addEventListener('click', savePontoSettings);
    document.getElementById('createAbsenceForm')?.addEventListener('submit', handleCreateAbsence);
    
    document.getElementById('absenceList')?.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action="delete-absence"]');
        if (button) confirmDeleteAbsence(button.dataset.id);
    });

    document.getElementById('confirmDelete')?.addEventListener('click', () => {
        if (currentDeleteAction) currentDeleteAction();
        document.getElementById('confirmDeleteModal').classList.add('hidden');
    });
    document.getElementById('cancelDelete')?.addEventListener('click', () => {
        document.getElementById('confirmDeleteModal').classList.add('hidden');
    });

    // Listeners para o novo modal de edição de registro
    document.getElementById('editRecordForm')?.addEventListener('submit', handleSaveRecord);
    document.getElementById('cancelEditRecord')?.addEventListener('click', () => {
        document.getElementById('editRecordModal').classList.add('hidden');
    });
    
    // Listener de eventos para os botões dinâmicos no detalhe do calendário
    document.getElementById('calendar-record-details')?.addEventListener('click', handleCalendarDetailAction);
}

function updatePontoUI() {
    populateUserSelects();
    updatePendingJustifications();
    renderCalendar();
    displayPontoSettings();
    displayAbsences();
}

function populateUserSelects() {
    const userSelectors = document.querySelectorAll('#reportUser, #calendar-user-select, #absenceAppliesTo');
    const { users } = getGlobalData();
    if (!users || !Array.isArray(users)) return;

    userSelectors.forEach(select => {
        if (!select) return;
        const oldValue = select.value;
        const firstOption = select.options[0]?.cloneNode(true);
        select.innerHTML = '';
        if (firstOption && (firstOption.value === 'todos' || firstOption.value === '')) {
            select.appendChild(firstOption);
        }
        users.filter(u => u.role !== 'admin').forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.nomeFantasia;
            select.appendChild(option);
        });
        select.value = oldValue;
    });
}

function displayPontoSettings() {
    const { pontoConfig } = getGlobalData();
    const toleranciaEl = document.getElementById('tolerancia');
    const bonusEl = document.getElementById('punctualityBonusValue');
    if (toleranciaEl) toleranciaEl.value = pontoConfig.toleranciaMinutos || 5;
    if (bonusEl) bonusEl.value = pontoConfig.punctualityBonusValue || 50;
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
    `).join('') : '<p class="text-gray-400 italic text-sm">Nenhuma ausência geral cadastrada.</p>';
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
            const newStatus = recordSnap.data().status === 'falta_justificada' ? 'falta_abonada' : recordSnap.data().status;
            updateData = { aprovadoPorAdm: true, status: newStatus };
        } else {
            const newStatus = recordSnap.data().status === 'falta_justificada' ? 'falta_rejeitada' : recordSnap.data().status;
            updateData = { 
                aprovadoPorAdm: false, 
                status: newStatus,
                justificativa: `(Rejeitada) ${recordSnap.data().justificativa}` 
            };
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
            const dateString = dayjs(date).format('YYYY-MM-DD');
            const recordId = `${selectedUserId}_${dateString}`;
            const record = pontoRecords.find(r => r.id === recordId);
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

function isWorkDay(date, user) {
    if (!user || !user.diasTrabalho) return false;
    const dayOfWeek = dayjs(date).day();
    return user.diasTrabalho.includes(dayOfWeek);
}

function showRecordDetails(date) {
    const detailsArea = document.getElementById('calendar-record-details');
    const selectedUserId = document.getElementById('calendar-user-select').value;
    const { users, pontoRecords } = getGlobalData();

    if (!selectedUserId) {
        detailsArea.innerHTML = `<p class="text-center text-yellow-400">Selecione um funcionário.</p>`;
        detailsArea.classList.remove('hidden');
        return;
    }

    detailsArea.classList.remove('hidden');
    detailsArea.innerHTML = `<p class="text-center text-gray-400">Carregando...</p>`;
    
    const user = users.find(u => u.id === selectedUserId);
    const dateString = dayjs(date).format('YYYY-MM-DD');
    const recordId = `${selectedUserId}_${dateString}`;
    const record = pontoRecords.find(r => r.id === recordId);
    
    let html = `<h4 class="font-bold border-b border-gray-700 pb-2 mb-2">Detalhes do Dia: ${dayjs(date).format('DD/MM/YYYY')}</h4>`;

    if (record) {
        html += `
            <div class="text-sm space-y-1">
                <p><strong>Status:</strong> <span class="capitalize">${(record.status || 'N/A').replace(/_/g, ' ')}</span></p>
                <p><strong>Entrada:</strong> ${record.entrada ? dayjs(record.entrada).format('HH:mm') : '--:--'}</p>
                <p><strong>Saída:</strong> ${record.saida ? dayjs(record.saida).format('HH:mm') : '--:--'}</p>
                <p><strong>Justificativa:</strong> ${record.justificativa || 'Nenhuma'}</p>
            </div>
            <div class="flex gap-2 mt-4">
                <button data-action="edit-record" data-record-id="${record.id}" class="btn btn-sm btn-secondary flex-1">Editar</button>
                <button data-action="delete-record" data-record-id="${record.id}" class="btn btn-sm btn-danger flex-1">Apagar</button>
            </div>
        `;
    } else {
        if (isWorkDay(date, user)) {
             html += `
                <p class="text-center text-yellow-400 mt-2">Ausência não justificada.</p>
                <div class="flex gap-2 mt-4">
                    <button data-action="create-record" data-date="${dateString}" data-user-id="${selectedUserId}" class="btn btn-sm btn-primary w-full">Criar Registro / Abonar Falta</button>
                </div>
            `;
        } else {
            html += `<p class="text-center text-gray-400 mt-2">Dia de folga.</p>`;
        }
    }
    detailsArea.innerHTML = html;
}

function handleCalendarDetailAction(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const { action, recordId, date, userId } = button.dataset;
    const { pontoRecords } = getGlobalData();

    if (action === 'edit-record') {
        const record = pontoRecords.find(r => r.id === recordId);
        openRecordModal({ record });
    } else if (action === 'create-record') {
        openRecordModal({ date, userId });
    } else if (action === 'delete-record') {
        showConfirmDeleteModal(`Tem certeza que deseja apagar este registro? Esta ação não pode ser desfeita.`, async () => {
            await deleteDoc(doc(db, "registrosPonto", recordId));
        });
    }
}

function openRecordModal({ record, date, userId }) {
    const modal = document.getElementById('editRecordModal');
    const form = document.getElementById('editRecordForm');
    form.reset();

    if (record) {
        document.getElementById('editRecordModalTitle').textContent = 'Editar Registro';
        form.querySelector('#editRecordId').value = record.id;
        form.querySelector('#editRecordEntrada').value = record.entrada ? dayjs(record.entrada).format('HH:mm') : '';
        form.querySelector('#editRecordSaida').value = record.saida ? dayjs(record.saida).format('HH:mm') : '';
        form.querySelector('#editRecordStatus').value = record.status || 'completo';
        form.querySelector('#editRecordJustificativa').value = record.justificativa || '';
    } else {
        document.getElementById('editRecordModalTitle').textContent = 'Criar Novo Registro';
        form.querySelector('#editRecordDate').value = date;
        form.querySelector('#editRecordUserId').value = userId;
    }
    
    modal.classList.remove('hidden');
}

async function handleSaveRecord(e) {
    e.preventDefault();
    const form = e.target;
    const recordId = form.querySelector('#editRecordId').value;
    const dateStr = form.querySelector('#editRecordDate').value;
    const userId = form.querySelector('#editRecordUserId').value;
    
    const entradaTime = form.querySelector('#editRecordEntrada').value;
    const saidaTime = form.querySelector('#editRecordSaida').value;

    const recordDate = recordId ? recordId.split('_')[1] : dateStr;

    const recordData = {
        status: form.querySelector('#editRecordStatus').value,
        justificativa: form.querySelector('#editRecordJustificativa').value.trim(),
        entrada: entradaTime ? dayjs(`${recordDate}T${entradaTime}`).toISOString() : null,
        saida: saidaTime ? dayjs(`${recordDate}T${saidaTime}`).toISOString() : null,
    };

    let docId, dataToSave;
    if (recordId) {
        docId = recordId;
        dataToSave = recordData;
    } else {
        docId = `${userId}_${dateStr}`;
        dataToSave = {
            ...recordData,
            id: docId,
            employeeId: userId,
            data: dayjs(dateStr).toDate(),
            minutosAtrasado: 0,
            horasExtras: 0,
        };
    }
    
    try {
        await setDoc(doc(db, "registrosPonto", docId), dataToSave, { merge: true });
        document.getElementById('editRecordModal').classList.add('hidden');
    } catch (error) {
        console.error("Erro ao salvar registro:", error);
        alert("Ocorreu um erro ao salvar o registro.");
    }
}

async function generateMonthlyReport() {
    const userId = document.getElementById('reportUser').value;
    const month = document.getElementById('reportMonth').value;
    if (!userId || !month) {
        alert('Por favor, selecione um funcionário e um mês para gerar o relatório.');
        return;
    }

    const { users, pontoRecords, absences, pontoConfig } = getGlobalData();
    const user = users.find(u => u.id === userId);
    if (!user) {
        alert('Usuário não encontrado.');
        return;
    }

    const [year, monthNum] = month.split('-');
    const startDate = dayjs(`${year}-${monthNum}-01`).startOf('month');
    const endDate = startDate.endOf('month');

    const userRecords = pontoRecords.filter(record => {
        if (!record.data || !record.data.seconds) return false;
        const recordDate = dayjs(record.data.seconds * 1000);
        return record.employeeId === userId &&
               recordDate.isAfter(startDate.subtract(1, 'day')) &&
               recordDate.isBefore(endDate.add(1, 'day'));
    });

    try {
        const reportHTML = generateReportHTML(user, userRecords, startDate.toDate(), endDate.toDate(), absences, pontoConfig);
        const reportWindow = window.open('', '_blank');
        reportWindow.document.write(reportHTML);
        reportWindow.document.close();
    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        alert('Ocorreu um erro ao tentar gerar o relatório.');
    }
}

function generateReportHTML(user, records, startDate, endDate, allAbsences, pontoConfig) {
    let latenessDeductions = 0;
    let latenessCount = 0;
    let totalOvertimeMinutes = 0;
    let workDaysInMonth = 0;
    let presentDays = 0;
    let dayjs = window.dayjs;

    let currentDay = dayjs(startDate);
    while (currentDay.isSameOrBefore(endDate)) {
        if (isWorkDay(currentDay.toDate(), user) && !allAbsences.some(abs => abs.date === currentDay.format('YYYY-MM-DD'))) {
            workDaysInMonth++;
        }
        currentDay = currentDay.add(1, 'day');
    }

    let totalDailyMinutes = 0;
    if (user.horarioEntrada1 && user.horarioSaida1) {
        totalDailyMinutes += dayjs(user.horarioSaida1, 'HH:mm').diff(dayjs(user.horarioEntrada1, 'HH:mm'), 'minute');
    }
    const workDays = workDaysInMonth || 22; // Evita divisão por zero
    const minuteValue = (user.salarioFixo || 0) / (workDays * totalDailyMinutes);

    records.forEach(record => {
        if (record.status && !record.status.startsWith('falta')) {
            presentDays++;
            const toleranciaMinutos = pontoConfig.toleranciaMinutos || 5;
            if (record.minutosAtrasado > toleranciaMinutos) {
                latenessCount++;
                // Recalcula o desconto com base nos minutos de atraso e valor do minuto atual
                latenessDeductions += (record.minutosAtrasado * minuteValue);
            }
            totalOvertimeMinutes += record.horasExtras || 0;
        }
    });

    const absenceDays = workDaysInMonth - presentDays;
    const dayValue = minuteValue * totalDailyMinutes;
    const absenceDeductions = absenceDays > 0 ? absenceDays * dayValue : 0;
    
    const totalDeductions = latenessDeductions + absenceDeductions;
    const totalOvertimeHours = Math.floor(totalOvertimeMinutes / 60);
    const totalOvertimeMins = totalOvertimeMinutes % 60;

    const overtimeValue = totalOvertimeMinutes * (minuteValue * 1.5);
    const punctualityBonusValue = pontoConfig.punctualityBonusValue || 50;
    const punctualityBonus = latenessCount === 0 ? punctualityBonusValue : 0;
    const finalSalary = (user.salarioFixo || 0) + overtimeValue + punctualityBonus - totalDeductions;

    return `
        <!DOCTYPE html><html lang="pt-BR" class="dark"><head><meta charset="UTF-8">
        <title>Relatório Mensal - ${user.nomeFantasia}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style> body { font-family: 'Inter', sans-serif; } .no-print { display: block; } @media print { .no-print { display: none; } } </style>
        </head><body class="bg-gray-900 text-white p-8">
            <div class="max-w-4xl mx-auto bg-gray-800 p-8 rounded-lg shadow-xl">
                <header class="text-center mb-8 border-b border-gray-700 pb-4">
                    <h2 class="text-3xl font-bold">Relatório Mensal de Ponto</h2>
                    <p class="text-gray-400 text-lg">${dayjs(startDate).format('MMMM [de] YYYY')}</p>
                    <p class="text-gray-300 mt-2">Funcionário: <span class="font-semibold">${user.nomeFantasia}</span></p>
                </header>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div class="bg-gray-700 p-6 rounded-lg">
                        <h3 class="text-xl font-semibold mb-4 border-b border-gray-600 pb-2">Resumo de Frequência</h3>
                        <ul class="space-y-2 text-gray-300">
                            <li><strong>Dias úteis no mês:</strong> ${workDaysInMonth}</li>
                            <li><strong>Dias trabalhados:</strong> ${presentDays}</li>
                            <li class="text-red-400"><strong>Faltas (não justificadas):</strong> ${absenceDays}</li>
                            <li class="text-yellow-400"><strong>Atrasos (> tolerância):</strong> ${latenessCount}</li>
                            <li><strong>Total de horas extras:</strong> ${totalOvertimeHours}h ${totalOvertimeMins}m</li>
                        </ul>
                    </div>
                    <div class="bg-gray-700 p-6 rounded-lg">
                        <h3 class="text-xl font-semibold mb-4 border-b border-gray-600 pb-2">Resumo Financeiro</h3>
                        <ul class="space-y-2 text-gray-300">
                            <li><strong>Salário base:</strong> R$ ${(user.salarioFixo || 0).toFixed(2)}</li>
                            <li class="text-green-400"><strong>Valor horas extras:</strong> + R$ ${overtimeValue.toFixed(2)}</li>
                            <li class="text-green-400"><strong>Bônus pontualidade:</strong> + R$ ${punctualityBonus.toFixed(2)}</li>
                            <li class="text-yellow-400"><strong>Descontos por Atrasos:</strong> - R$ ${latenessDeductions.toFixed(2)}</li>
                            <li class="text-red-400"><strong>Descontos por Faltas:</strong> - R$ ${absenceDeductions.toFixed(2)}</li>
                            <li class="pt-2 border-t border-gray-600 mt-2 font-bold text-white text-lg"><strong>Salário final estimado:</strong> R$ ${finalSalary.toFixed(2)}</li>
                        </ul>
                    </div>
                </div>
                <div class="text-center mt-8 no-print">
                    <button onclick="window.print()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg">Imprimir Relatório</button>
                </div>
            </div>
        </body></html>
    `;
}