// ponto/scripts/dashboard.js (REVISADO - Lógica mais robusta e clara)

import { db } from '../../js/config.js';
import { checkAuth, logout, setupThemeToggle, initializeDayjs } from './main.js';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, collection, query, where, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Estado da aplicação para centralizar os dados do utilizador e da sessão
const appState = {
    currentUserData: null,
    todayRecord: null,
    config: {
        toleranciaMinutos: 5,
        punctualityBonusValue: 50,
    },
    allAbsences: [],
    workInterval: null,
    recordsListener: null,
    userListener: null,
};

/**
 * Ponto de entrada principal: verifica a autenticação e inicia o dashboard.
 */
checkAuth((userData) => {
    // Redireciona se for admin
    if (userData && userData.role === 'admin') {
        window.location.href = '../admin.html';
        return;
    }
    appState.currentUserData = userData;
    initializeDashboard();
});

/**
 * Função de inicialização principal do dashboard.
 */
function initializeDashboard() {
    if (!appState.currentUserData) return;

    // Inicializa bibliotecas e configurações de UI
    initializeDayjs();
    setupThemeToggle();
    setupEventListeners();

    // Carrega dados iniciais e estabelece listeners em tempo real
    loadInitialData();
    listenToUserDataChanges();
    listenToRecordsChanges();

    // Inicia o relógio em tempo real
    setInterval(updateClock, 1000);
}

/**
 * Configura todos os event listeners estáticos da página.
 */
function setupEventListeners() {
    document.getElementById('logoutButton')?.addEventListener('click', logout);
    document.getElementById('clockInButton')?.addEventListener('click', handleClockIn);
    document.getElementById('clockOutButton')?.addEventListener('click', handleClockOut);

    // Listener para o botão de justificar falta no histórico semanal
    document.getElementById('weeklyHistory')?.addEventListener('click', (e) => {
        if (e.target?.matches('button[data-action="justify-absence"]')) {
            showAbsenceJustificationModal(e.target.dataset.date);
        }
    });

    // Listeners para os botões dos modais
    document.getElementById('confirmAbsenceJustification')?.addEventListener('click', handleAbsenceJustification);
    document.getElementById('cancelAbsenceJustification')?.addEventListener('click', () => hideModal('absenceJustificationModal'));
    
    document.getElementById('confirmEarlyLeaveButton')?.addEventListener('click', handleEarlyLeave);
    document.getElementById('cancelEarlyLeave')?.addEventListener('click', () => hideModal('earlyLeaveModal'));
}

/**
 * Carrega os dados essenciais na primeira vez que a página é aberta.
 */
async function loadInitialData() {
    const { currentUserData } = appState;
    document.getElementById('welcomeMessage').textContent = `Bem-vindo(a), ${currentUserData.nomeFantasia || 'Utilizador'}!`;

    try {
        // Carrega configurações gerais do ponto
        const configRef = doc(db, "configuracaoPonto", "default");
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
            appState.config = { ...appState.config, ...configSnap.data() };
        }

        // Carrega ausências gerais (feriados, etc.)
        const absenceSnapshot = await getDocs(collection(db, "generalAbsences"));
        appState.allAbsences = absenceSnapshot.docs.map(d => d.data());

        // Verifica se já existe um registo para hoje
        const todayId = window.dayjs().format('YYYY-MM-DD');
        const recordRef = doc(db, "registrosPonto", `${currentUserData.uid}_${todayId}`);
        const recordSnap = await getDoc(recordRef);

        if (recordSnap.exists()) {
            appState.todayRecord = recordSnap.data();
            updateUIBasedOnRecord(appState.todayRecord);
        } else {
            appState.todayRecord = null; // Garante que não há registo antigo em memória
            updateUIBasedOnRecord(null);
        }

    } catch (error) {
        console.error("Erro ao carregar dados iniciais:", error);
        document.getElementById('clockMessage').textContent = "Erro ao carregar dados. Tente recarregar a página.";
    }
}

/**
 * Ouve alterações nos dados do utilizador (ex: crédito de horas).
 */
function listenToUserDataChanges() {
    if (appState.userListener) appState.userListener(); // Cancela o listener anterior
    const userRef = doc(db, "users", appState.currentUserData.uid);
    appState.userListener = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            appState.currentUserData = { uid: docSnap.id, ...docSnap.data() };
            updateTimeCreditUI(appState.currentUserData.creditoHoras);
        }
    });
}

/**
 * Ouve alterações nos registos de ponto do utilizador para atualizar o histórico.
 */
function listenToRecordsChanges() {
    if (appState.recordsListener) appState.recordsListener(); // Cancela o listener anterior
    const q = query(collection(db, "registrosPonto"), where("employeeId", "==", appState.currentUserData.uid));
    appState.recordsListener = onSnapshot(q, (snapshot) => {
        const allRecords = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        updateMonthlySummary(allRecords);
        updateWeeklyHistory(allRecords);
    });
}

/**
 * Atualiza o relógio e a data em tempo real e verifica a disponibilidade do botão de entrada.
 */
function updateClock() {
    const now = window.dayjs();
    document.getElementById('realTimeClock').textContent = now.format('HH:mm:ss');
    document.getElementById('currentDate').textContent = now.format('dddd, DD [de] MMMM');
    checkClockInAvailability(now);
}

// --- LÓGICA DE REGISTO DE PONTO ---

/**
 * Manipula o clique no botão de registar entrada.
 */
async function handleClockIn() {
    const clockInBtn = document.getElementById('clockInButton');
    clockInBtn.disabled = true;
    clockInBtn.textContent = "A registar...";

    const now = window.dayjs();
    const { horarioEntrada1, horarioEntradaSabado } = appState.currentUserData;

    const expectedEntryTimeStr = (now.day() === 6 && horarioEntradaSabado) ? horarioEntradaSabado : horarioEntrada1;
    const expectedEntryTime = window.dayjs(expectedEntryTimeStr, 'HH:mm');
    const latenessMinutes = Math.max(0, now.diff(expectedEntryTime, 'minute'));

    const newRecord = {
        employeeId: appState.currentUserData.uid,
        data: now.toDate(),
        entrada: now.toISOString(),
        saida: null,
        minutosAtrasado: latenessMinutes,
        horasExtras: 0,
        justificativa: latenessMinutes > appState.config.toleranciaMinutos ? "Atraso a justificar" : null,
        aprovadoPorAdm: latenessMinutes > appState.config.toleranciaMinutos ? false : null,
        status: 'em_andamento'
    };
    
    // Mostra o modal de atraso se necessário
    if (latenessMinutes > appState.config.toleranciaMinutos) {
        showLatenessModal(latenessMinutes, async (justification) => {
            newRecord.justificativa = justification;
            await saveRecordAndUpdateUserStatus(newRecord, 'trabalhando');
        });
    } else {
        await saveRecordAndUpdateUserStatus(newRecord, 'trabalhando');
    }
}

/**
 * Manipula o clique no botão de registar saída.
 */
async function handleClockOut() {
    const { todayRecord, currentUserData } = appState;
    if (!todayRecord || todayRecord.status !== 'em_andamento') return;

    const now = window.dayjs();
    const expectedExitTime = calculateExpectedExitTime(window.dayjs(todayRecord.entrada), todayRecord);

    // Se a saída for antecipada, exige uma justificação
    if (now.isBefore(expectedExitTime)) {
        showModal('earlyLeaveModal');
        return;
    }

    const overtimeMinutes = Math.max(0, now.diff(expectedExitTime, 'minute'));
    
    const updatedRecord = {
        ...todayRecord,
        saida: now.toISOString(),
        status: 'completo',
        horasExtras: overtimeMinutes,
    };
    
    const newCredit = (currentUserData.creditoHoras || 0) + overtimeMinutes;
    await saveRecordAndUpdateUserStatus(updatedRecord, 'ausente', { creditoHoras: newCredit });
}

/**
 * Guarda o registo e atualiza o estado do utilizador no Firestore.
 * @param {object} record - O objeto do registo a ser guardado.
 * @param {string} userStatus - O novo status do utilizador ('trabalhando' ou 'ausente').
 * @param {object} [extraUserData={}] - Dados extras para atualizar no documento do utilizador.
 */
async function saveRecordAndUpdateUserStatus(record, userStatus, extraUserData = {}) {
    try {
        const todayId = window.dayjs(record.data).format('YYYY-MM-DD');
        const recordRef = doc(db, "registrosPonto", `${record.employeeId}_${todayId}`);
        const userRef = doc(db, "users", record.employeeId);
        
        // Usar um batch para garantir que ambas as operações são bem-sucedidas
        const batch = writeBatch(db);
        batch.set(recordRef, record, { merge: true });
        batch.update(userRef, { statusPonto: userStatus, ...extraUserData });
        await batch.commit();

        appState.todayRecord = record;
        updateUIBasedOnRecord(record);

    } catch (error) {
        console.error("Erro ao guardar registo:", error);
        document.getElementById('clockMessage').textContent = "Erro ao guardar o registo. Tente novamente.";
    } finally {
        // Reativa os botões em caso de erro ou sucesso
        document.getElementById('clockInButton').disabled = false;
        document.getElementById('clockInButton').textContent = "REGISTAR ENTRADA";
    }
}

/**
 * Manipula o envio do formulário de justificação de falta.
 */
async function handleAbsenceJustification() {
    const justificationText = document.getElementById('absenceJustificationText').value.trim();
    const date = document.getElementById('absenceJustificationDateText').dataset.date;
    const errorEl = document.getElementById('absenceJustificationErrorText');

    if (!justificationText) {
        errorEl.textContent = "A justificação é obrigatória.";
        return;
    }
    errorEl.textContent = '';

    const recordId = `${appState.currentUserData.uid}_${date}`;
    const recordRef = doc(db, "registrosPonto", recordId);

    try {
        // Cria um registo de falta justificada
        await setDoc(recordRef, {
            employeeId: appState.currentUserData.uid,
            data: window.dayjs(date).toDate(),
            status: 'falta_justificada',
            justificativa: justificationText,
            aprovadoPorAdm: false
        });
        hideModal('absenceJustificationModal');
    } catch (error) {
        console.error("Erro ao justificar falta: ", error);
        errorEl.textContent = "Erro ao enviar. Tente novamente.";
    }
}

/**
 * Manipula a confirmação de saída antecipada.
 */
async function handleEarlyLeave() {
    const justification = document.getElementById('earlyLeaveJustificationText').value.trim();
    const errorEl = document.getElementById('earlyLeaveErrorText');

    if (!justification) {
        errorEl.textContent = "A justificação é obrigatória.";
        return;
    }
    errorEl.textContent = '';
    
    const updatedRecord = {
        ...appState.todayRecord,
        saida: window.dayjs().toISOString(),
        status: 'completo_antecipado',
        justificativa: justification
    };

    await saveRecordAndUpdateUserStatus(updatedRecord, 'ausente');
    hideModal('earlyLeaveModal');
}

/**
 * Mostra o modal de justificação de falta.
 * @param {string} dateString - A data da falta no formato YYYY-MM-DD.
 */
function showAbsenceJustificationModal(dateString) {
    document.getElementById('absenceJustificationDateText').textContent = `Data: ${window.dayjs(dateString).format('DD/MM/YYYY')}`;
    document.getElementById('absenceJustificationDateText').dataset.date = dateString;
    document.getElementById('absenceJustificationText').value = '';
    showModal('absenceJustificationModal');
}

/**
 * Mostra o modal de atraso e configura os botões.
 * @param {number} latenessMinutes - Os minutos de atraso.
 * @param {function} onJustify - Callback a ser executado com a justificação.
 */
function showLatenessModal(latenessMinutes, onJustify) {
    const modal = document.getElementById('latenessModal');
    modal.querySelector('#latenessModalText').textContent = `Você está ${latenessMinutes} minutos atrasado. O que deseja fazer?`;
    
    const justificationInput = modal.querySelector('#justificationText');
    justificationInput.value = '';

    const deductBtn = modal.querySelector('#deductSalaryButton');
    const compensateBtn = modal.querySelector('#compensateTimeButton');

    // Remove event listeners antigos para evitar duplicação
    const newDeductBtn = deductBtn.cloneNode(true);
    deductBtn.parentNode.replaceChild(newDeductBtn, deductBtn);
    const newCompensateBtn = compensateBtn.cloneNode(true);
    compensateBtn.parentNode.replaceChild(newCompensateBtn, compensateBtn);

    newDeductBtn.addEventListener('click', () => {
        onJustify(`Desconto em folha. Justificativa: ${justificationInput.value}`);
        hideModal('latenessModal');
    });

    newCompensateBtn.addEventListener('click', () => {
        onJustify(`Compensação no fim do dia. Justificativa: ${justificationInput.value}`);
        hideModal('latenessModal');
    });
    
    showModal('latenessModal');
}

// --- Funções Utilitárias de UI ---
function showModal(modalId) { document.getElementById(modalId).classList.remove('hidden'); }
function hideModal(modalId) { document.getElementById(modalId).classList.add('hidden'); }

/**
 * Atualiza a UI com base no registo do dia.
 * @param {object|null} record - O registo de hoje ou nulo se não existir.
 */
function updateUIBasedOnRecord(record) {
    if (record?.status === 'em_andamento') {
        updateUIForActiveSession(record);
    } else if (record?.status?.startsWith('completo')) {
        updateUIForSessionEnd(record);
    } else {
        document.getElementById('clockInButton').classList.remove('hidden');
        document.getElementById('clockOutButton').classList.add('hidden');
        document.getElementById('statusText').textContent = 'A aguardar Entrada';
        document.getElementById('statusDot').className = 'status-dot status-gray';
        document.getElementById('workTimer').textContent = '00:00:00';
        document.getElementById('expectedLeaveTime').textContent = 'Saída Prevista: --:--';
        stopWorkTimer();
    }
}

function updateUIForActiveSession(record) {
    document.getElementById('clockInButton').classList.add('hidden');
    document.getElementById('clockOutButton').classList.remove('hidden');
    document.getElementById('statusText').textContent = 'Trabalhando';
    document.getElementById('statusDot').className = 'status-dot status-green';
    startWorkTimer(window.dayjs(record.entrada));
    
    const expectedExit = calculateExpectedExitTime(window.dayjs(record.entrada), record);
    document.getElementById('expectedLeaveTime').textContent = `Saída Prevista: ${expectedExit.format('HH:mm')}`;
}

function updateUIForSessionEnd(record) {
    document.getElementById('clockInButton').classList.add('hidden');
    document.getElementById('clockOutButton').classList.add('hidden');
    document.getElementById('statusText').textContent = 'Trabalho Concluído';
    document.getElementById('statusDot').className = 'status-dot status-blue';
    stopWorkTimer();

    const entry = window.dayjs(record.entrada);
    const exit = window.dayjs(record.saida);
    const duration = exit.diff(entry, 'second');
    const hours = Math.floor(duration / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((duration % 3600) / 60).toString().padStart(2, '0');
    const seconds = (duration % 60).toString().padStart(2, '0');
    document.getElementById('workTimer').textContent = `${hours}:${minutes}:${seconds}`;
}

function updateTimeCreditUI(creditMinutes) {
    const totalMinutes = Number(creditMinutes) || 0;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    document.getElementById('timeCredit').textContent = `${hours}h ${minutes}m`;
}

function updateMonthlySummary(allRecords) {
    const startOfMonth = window.dayjs().startOf('month');
    const endOfMonth = window.dayjs().endOf('month');
    
    const monthRecords = allRecords.filter(r => {
        const recordDate = window.dayjs(r.data.seconds * 1000);
        return recordDate.isAfter(startOfMonth) && recordDate.isBefore(endOfMonth);
    });

    const latenessCount = monthRecords.filter(r => r.minutosAtrasado > appState.config.toleranciaMinutos).length;
    document.getElementById('monthlyLatenessCount').textContent = latenessCount;

    // A lógica de desconto é complexa e depende do salário, deixamos como 0.00 por agora.
    document.getElementById('monthlyDeduction').textContent = 'R$ 0,00';

    const bonusEl = document.getElementById('punctualityBonus');
    if (latenessCount === 0) {
        bonusEl.textContent = `R$ ${appState.config.punctualityBonusValue.toFixed(2)}`;
        bonusEl.className = 'font-bold text-green-500 text-2xl';
    } else {
        bonusEl.textContent = 'Não elegível';
        bonusEl.className = 'font-bold text-red-500 text-2xl';
    }
}

function updateWeeklyHistory(allRecords) {
    const historyContainer = document.getElementById('weeklyHistory');
    historyContainer.innerHTML = '';
    
    const today = window.dayjs();
    for (let i = 0; i < 7; i++) {
        const day = today.subtract(i, 'day');
        const dateString = day.format('YYYY-MM-DD');
        const record = allRecords.find(r => r.id && r.id.endsWith(dateString));
        
        let html = '';
        if (record) {
            const entry = record.entrada ? window.dayjs(record.entrada).format('HH:mm') : '--';
            const exit = record.saida ? window.dayjs(record.saida).format('HH:mm') : '--';
            const status = record.status.replace('_', ' ');
            html = `
                <div class="p-3 rounded-lg bg-gray-800 flex justify-between items-center">
                    <div>
                        <p class="font-semibold">${day.format('dddd, DD/MM')}</p>
                        <p class="text-sm text-gray-400">Entrada: ${entry} | Saída: ${exit} | Status: ${status}</p>
                    </div>
                </div>`;
        } else if (appState.currentUserData && Array.isArray(appState.currentUserData.diasTrabalho) && appState.currentUserData.diasTrabalho.includes(day.day())) {
            // Se era um dia de trabalho e não há registo, é uma falta.
            html = `
                <div class="p-3 rounded-lg bg-red-900 bg-opacity-50 flex justify-between items-center">
                    <div>
                        <p class="font-semibold">${day.format('dddd, DD/MM')}</p>
                        <p class="text-sm text-red-300">Falta não justificada</p>
                    </div>
                    <button data-date="${dateString}" data-action="justify-absence" class="btn btn-secondary btn-sm">Justificar</button>
                </div>`;
        }
        
        if (html) {
            historyContainer.innerHTML += html;
        }
    }
    
    if (historyContainer.innerHTML === '') {
        historyContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center">Nenhum registro encontrado.</p>';
    }
}

function startWorkTimer(startTime) {
    stopWorkTimer();
    appState.workInterval = setInterval(() => {
        const now = window.dayjs();
        const duration = now.diff(startTime, 'second');
        const hours = Math.floor(duration / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((duration % 3600) / 60).toString().padStart(2, '0');
        const seconds = (duration % 60).toString().padStart(2, '0');
        document.getElementById('workTimer').textContent = `${hours}:${minutes}:${seconds}`;
    }, 1000);
}

function stopWorkTimer() {
    if (appState.workInterval) {
        clearInterval(appState.workInterval);
        appState.workInterval = null;
    }
}

function checkClockInAvailability(now) {
    // Esta função pode ser expandida para, por exemplo, desabilitar o botão de entrada
    // fora do horário de trabalho, mas por enquanto a deixamos simples.
    const clockInBtn = document.getElementById('clockInButton');
    if (!clockInBtn.classList.contains('hidden')) {
        clockInBtn.disabled = false;
    }
}

function calculateExpectedExitTime(entryTime, record) {
    const { horarioSaida1, horarioSaidaSabado } = appState.currentUserData;
    const isSaturday = entryTime.day() === 6;
    const expectedExitStr = (isSaturday && horarioSaidaSabado) ? horarioSaidaSabado : horarioSaida1;
    let expectedExitTime = window.dayjs(expectedExitStr, 'HH:mm');

    // Adiciona o tempo a compensar do atraso, se houver
    if (record.justificativa?.includes('Compensação')) {
        expectedExitTime = expectedExitTime.add(record.minutosAtrasado, 'minute');
    }

    return expectedExitTime;
}