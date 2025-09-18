// js/admin/ponto.js (Módulo de Administração do Ponto Eletrônico - REATORIZADO)

import { doc, getDoc, updateDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let db;
let getGlobalData;
let currentDeleteAction = null; // Armazena a função a ser executada na confirmação de exclusão

// Estado do calendário para facilitar a navegação entre meses
let calendarState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    selectedDate: null
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

    setupEventListeners();

    // Ouve as atualizações de dados para redesenhar a UI de forma reativa
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

/**
 * Configura todos os event listeners estáticos da secção.
 */
function setupEventListeners() {
    // Ações principais
    document.getElementById('generateReportBtn')?.addEventListener('click', generateMonthlyReport);
    document.getElementById('savePontoSettings')?.addEventListener('click', savePontoSettings);
    document.getElementById('createAbsenceForm')?.addEventListener('submit', handleCreateAbsence);

    // Navegação do calendário
    document.getElementById('calendar-prev-month')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('calendar-next-month')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('calendar-user-select')?.addEventListener('change', renderCalendar);

    // Modal de confirmação de exclusão
    document.getElementById('confirmDelete')?.addEventListener('click', () => {
        if (currentDeleteAction) currentDeleteAction();
        hideConfirmDeleteModal();
    });
    document.getElementById('cancelDelete')?.addEventListener('click', hideConfirmDeleteModal);

    // Modal de edição de registo
    document.getElementById('editRecordForm')?.addEventListener('submit', handleSaveRecord);
    document.getElementById('cancelEditRecord')?.addEventListener('click', () => {
        document.getElementById('editRecordModal').classList.add('hidden');
    });

    // Delegação de eventos para ações dinâmicas
    document.getElementById('pendingJustifications')?.addEventListener('click', handleJustificationAction);
    document.getElementById('absenceList')?.addEventListener('click', handleAbsenceListAction);
    document.getElementById('calendar-record-details')?.addEventListener('click', handleCalendarDetailAction);
}

/**
 * Função central que atualiza todas as partes da UI do módulo de Ponto.
 */
function updatePontoUI() {
    populateUserSelects();
    updatePendingJustifications();
    renderCalendar();
    displayPontoSettings();
    displayAbsences();
}

/**
 * Popula todos os seletores de utilizador na página.
 */
function populateUserSelects() {
    const userSelectors = document.querySelectorAll('#reportUser, #calendar-user-select, #absenceAppliesTo');
    const { users } = getGlobalData();
    const employees = users.filter(u => u.role !== 'admin');

    userSelectors.forEach(select => {
        if (!select) return;
        const oldValue = select.value;
        const firstOptionHTML = select.options[0]?.outerHTML || '';

        select.innerHTML = firstOptionHTML; // Mantém a primeira opção (ex: "Todos" ou "Selecione")
        select.innerHTML += employees.map(user => `<option value="${user.id}">${user.nomeFantasia}</option>`).join('');

        select.value = oldValue;
    });
}

/**
 * Exibe as configurações de ponto nos campos do formulário.
 */
function displayPontoSettings() {
    const { pontoConfig } = getGlobalData();
    document.getElementById('tolerancia').value = pontoConfig.toleranciaMinutos || 5;
    document.getElementById('punctualityBonusValue').value = pontoConfig.punctualityBonusValue || 50;
}

/**
 * Guarda as novas configurações de ponto no Firestore.
 */
async function savePontoSettings() {
    const newConfig = {
        toleranciaMinutos: parseInt(document.getElementById('tolerancia').value, 10),
        punctualityBonusValue: parseFloat(document.getElementById('punctualityBonusValue').value)
    };
    const saveBtn = document.getElementById('savePontoSettings');
    saveBtn.disabled = true;
    saveBtn.textContent = 'A guardar...';
    try {
        await setDoc(doc(db, "configuracaoPonto", "default"), newConfig, { merge: true });
        saveBtn.textContent = 'Guardado!';
        setTimeout(() => {
            saveBtn.textContent = 'Guardar Configurações';
            saveBtn.disabled = false;
        }, 2000);
    } catch (error) {
        console.error("Erro ao guardar configurações:", error);
        saveBtn.disabled = false;
    }
}

// --- LÓGICA DO CALENDÁRIO ---

/**
 * Altera o mês exibido no calendário.
 * @param {number} direction -1 para mês anterior, 1 para próximo mês.
 */
function changeMonth(direction) {
    const date = new Date(calendarState.year, calendarState.month);
    date.setMonth(date.getMonth() + direction);
    calendarState.year = date.getFullYear();
    calendarState.month = date.getMonth();
    renderCalendar();
}

/**
 * Renderiza o calendário para o mês e utilizador selecionados.
 */
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('calendar-month-year');
    if (!grid || !title) return;

    const selectedUserId = document.getElementById('calendar-user-select').value;
    const { pontoRecords } = getGlobalData();

    const currentDate = new Date(calendarState.year, calendarState.month);
    title.textContent = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

    grid.innerHTML = '';

    // Adiciona células vazias para os dias antes do início do mês
    for (let i = 0; i < firstDayOfMonth; i++) {
        grid.appendChild(document.createElement('div'));
    }

    // Cria uma célula para cada dia do mês
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(calendarState.year, calendarState.month, day);
        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        cell.innerHTML = `<div class="cal-day">${day}</div>`;
        cell.dataset.date = window.dayjs(date).format('YYYY-MM-DD');

        if (window.dayjs(date).isSame(new Date(), 'day')) {
            cell.classList.add('today');
        }

        // Se um utilizador estiver selecionado, adiciona o ponto de status
        if (selectedUserId) {
            const dateString = window.dayjs(date).format('YYYY-MM-DD');
            const record = pontoRecords.find(r => r.id === `${selectedUserId}_${dateString}`);
            if (record) {
                const statusDot = document.createElement('div');
                statusDot.className = `absolute bottom-1.5 h-1.5 w-1.5 rounded-full ${getStatusColor(record)}`;
                cell.appendChild(statusDot);
            }
        }

        cell.addEventListener('click', () => showRecordDetails(date));
        grid.appendChild(cell);
    }
}

/**
 * Retorna a classe de cor CSS com base no status do registo.
 * @param {object} record O registo de ponto.
 */
function getStatusColor(record) {
    if (!record || !record.status) return 'bg-gray-500';
    if (record.status.startsWith('completo')) return 'bg-green-500';
    if (record.status === 'falta_justificada') return 'bg-yellow-500';
    if (record.status === 'falta_abonada') return 'bg-blue-500';
    if (record.status.includes('falta')) return 'bg-red-500';
    if (record.minutosAtrasado > (getGlobalData().pontoConfig.toleranciaMinutos || 5)) return 'bg-red-500';
    return 'bg-green-500'; // Padrão para "presente"
}

// --- LÓGICA DE GERAÇÃO DE RELATÓRIO ---
/**
* Gera o relatório mensal para o usuário e mês selecionados.
*/
function generateMonthlyReport() {
    const userId = document.getElementById('reportUser').value;
    const monthYear = document.getElementById('reportMonth').value;

    if (!userId || !monthYear) {
        alert("Por favor, selecione um funcionário e um mês para gerar o relatório.");
        return;
    }

    const { users, pontoRecords, absences } = getGlobalData();
    const user = users.find(u => u.id === userId);
    if (!user) {
        alert("Funcionário não encontrado.");
        return;
    }

    const [year, month] = monthYear.split('-');
    const startDate = window.dayjs(`${year}-${month}-01`).startOf('month');
    const endDate = startDate.endOf('month');

    const userRecords = pontoRecords.filter(r =>
        r.employeeId === userId &&
        window.dayjs(r.data.seconds * 1000).isBetween(startDate, endDate, null, '[]')
    );

    const reportHTML = generateReportHTML(user, userRecords, startDate, absences);
    const reportWindow = window.open('', '_blank');
    reportWindow.document.write(reportHTML);
    reportWindow.document.close();
}

/**
* Gera o HTML para o relatório mensal.
* @param {object} user - O objeto do usuário.
* @param {Array} records - Os registros de ponto do usuário para o mês.
* @param {dayjs.Dayjs} date - O objeto dayjs para o início do mês.
* @param {Array} allAbsences - Lista de ausências gerais.
* @returns {string} O HTML do relatório.
*/
function generateReportHTML(user, records, date, allAbsences) {
    // Implementação da geração de HTML para o relatório
    // (similar à função de gerar relatório do OLX, mas adaptada para os dados de ponto)
    return `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Relatório Mensal de Ponto</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-100 p-8">
            <div class="max-w-4xl mx-auto bg-white p-6 rounded shadow">
                <h1 class="text-2xl font-bold mb-4">Relatório de Ponto - ${user.nomeFantasia}</h1>
                <p class="mb-6">Mês: ${date.format('MMMM [de] YYYY')}</p>
                <table class="w-full text-left">
                    <thead>
                        <tr>
                            <th class="p-2 border-b">Data</th>
                            <th class="p-2 border-b">Entrada</th>
                            <th class="p-2 border-b">Saída</th>
                            <th class="p-2 border-b">Status</th>
                            <th class="p-2 border-b">Atraso (min)</th>
                            <th class="p-2 border-b">Horas Extras (min)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${records.map(r => `
                            <tr>
                                <td class="p-2 border-b">${window.dayjs(r.data.seconds * 1000).format('DD/MM/YYYY')}</td>
                                <td class="p-2 border-b">${r.entrada ? window.dayjs(r.entrada).format('HH:mm') : '--'}</td>
                                <td class="p-2 border-b">${r.saida ? window.dayjs(r.saida).format('HH:mm') : '--'}</td>
                                <td class="p-2 border-b">${r.status || 'N/A'}</td>
                                <td class="p-2 border-b">${r.minutosAtrasado || 0}</td>
                                <td class="p-2 border-b">${r.horasExtras || 0}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </body>
        </html>
    `;
}

// --- Funções Utilitárias ---
function showConfirmDeleteModal(message, onConfirm) {
    document.getElementById('confirmDeleteText').textContent = message;
    currentDeleteAction = onConfirm;
    document.getElementById('confirmDeleteModal').classList.remove('hidden');
}

function hideConfirmDeleteModal() {
    document.getElementById('confirmDeleteModal').classList.add('hidden');
    currentDeleteAction = null;
}
// --- Funções de Manipulação de Eventos (stubs para evitar erros) ---
function handleCreateAbsence(e) { e.preventDefault(); console.log("handleCreateAbsence"); }
function handleSaveRecord(e) { e.preventDefault(); console.log("handleSaveRecord"); }
function handleJustificationAction(e) { console.log("handleJustificationAction"); }
function handleAbsenceListAction(e) { console.log("handleAbsenceListAction"); }
function handleCalendarDetailAction(e) { console.log("handleCalendarDetailAction"); }
function showRecordDetails(date) { console.log("showRecordDetails for", date); }
function updatePendingJustifications() { console.log("updatePendingJustifications"); }
function displayAbsences() { console.log("displayAbsences"); }