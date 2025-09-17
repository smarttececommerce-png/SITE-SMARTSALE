// ponto/scripts/dashboard.js
import { db } from '../../js/config.js';
import { checkAuth, logout, setupThemeToggle, initializeDayjs } from './main.js';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, query, where, getDocs, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let currentUserData;

// 1. Ponto de entrada principal
checkAuth((userData) => {
    if (userData && userData.role === 'admin') {
        window.location.href = '../admin.html';
        return;
    }
    currentUserData = userData;
    initializeDashboard();
});

// Variáveis globais
let todayRecord = null;
let workInterval;
let allAbsences = [];
let recordsListener = null;
let userListener = null;
let config = {
    toleranciaMinutos: 5,
    diasTrabalho: [1, 2, 3, 4, 5],
    punctualityBonusValue: 50,
};

// 2. Função de inicialização
function initializeDashboard() {
    if (!currentUserData) return;

    initializeDayjs();
    setupThemeToggle();

    document.getElementById('logoutButton')?.addEventListener('click', logout);
    document.getElementById('welcomeMessage').textContent = `Bem-vindo(a), ${currentUserData.nomeFantasia || currentUserData.uid}!`;

    loadInitialData();
    listenToRecords();
    listenToUserData();

    document.getElementById('clockInButton')?.addEventListener('click', handleClockIn);
    document.getElementById('clockOutButton')?.addEventListener('click', handleClockOut);

    document.getElementById('weeklyHistory')?.addEventListener('click', (e) => {
        if (e.target && e.target.matches('button[data-action="justify-absence"]')) {
            const date = e.target.dataset.date;
            showAbsenceJustificationModal(date);
        }
    });

    // Listeners para modais
    document.getElementById('confirmAbsenceJustification')?.addEventListener('click', handleAbsenceJustification);
    document.getElementById('cancelAbsenceJustification')?.addEventListener('click', () => {
        document.getElementById('absenceJustificationModal').classList.add('hidden');
    });

    document.getElementById('cancelEarlyLeave')?.addEventListener('click', () => {
        document.getElementById('earlyLeaveModal').classList.add('hidden');
    });

    setInterval(updateClock, 1000);
}

// --- Funções de Lógica Principal ---

async function loadInitialData() {
    try {
        const configRef = doc(db, "configuracaoPonto", "default");
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
            config = { ...config, ...configSnap.data() };
        }

        const absenceQuery = query(collection(db, "generalAbsences"));
        const absenceSnapshot = await getDocs(absenceQuery);
        allAbsences = absenceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const todayId = dayjs().format('YYYY-MM-DD');
        const recordRef = doc(db, "registrosPonto", `${currentUserData.uid}_${todayId}`);
        const recordSnap = await getDoc(recordRef);

        if (recordSnap.exists()) {
            todayRecord = recordSnap.data();
            if (todayRecord.status === 'em_andamento') {
                updateUIForActiveSession(todayRecord);
            } else if (todayRecord.status && todayRecord.status.startsWith('completo')) {
                updateUIForSessionEnd();
                const entry = dayjs(todayRecord.entrada);
                const exit = dayjs(todayRecord.saida);
                const diff = exit.diff(entry);
                const duration = new Date(diff);
                const hours = String(duration.getUTCHours()).padStart(2, '0');
                const minutes = String(duration.getUTCMinutes()).padStart(2, '0');
                const seconds = String(duration.getUTCSeconds()).padStart(2, '0');
                document.getElementById('workTimer').textContent = `${hours}:${minutes}:${seconds}`;
            }
        } else {
            todayRecord = { status: 'falta' };
        }

    } catch (error) {
        console.error("Erro ao carregar dados iniciais:", error);
    }
}

function listenToRecords() {
    if (recordsListener) recordsListener();
    const q = query(collection(db, "registrosPonto"), where("employeeId", "==", currentUserData.uid));
    recordsListener = onSnapshot(q, (querySnapshot) => {
        const allRecords = querySnapshot.docs.map(doc => doc.data());
        const sortedRecords = allRecords.sort((a, b) => (b.data.seconds || 0) - (a.data.seconds || 0));
        updateMonthlySummary(sortedRecords);
        updateWeeklyHistory(sortedRecords);
    }, (error) => {
        console.error("Erro ao escutar registros de ponto: ", error);
    });
}

function listenToUserData() {
    if (userListener) userListener();
    const userRef = doc(db, "users", currentUserData.uid);
    userListener = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            currentUserData = { uid: docSnap.id, ...docSnap.data() };
            updateTimeCreditUI(currentUserData.creditoHoras);
        }
    }, (error) => {
        console.error("Erro ao escutar dados do usuário: ", error);
    });
}

function updateClock() {
    const now = dayjs();
    document.getElementById('realTimeClock').textContent = now.format('HH:mm:ss');
    document.getElementById('currentDate').textContent = now.format('dddd, DD [de] MMMM');
    checkClockInAvailability(now);
}

// --- Funções de Registro de Ponto (Entrada e Saída) ---

async function handleClockIn() {
    const clockInBtn = document.getElementById('clockInButton');
    clockInBtn.disabled = true;
    clockInBtn.textContent = "Registrando...";

    const now = dayjs();
    const isSaturday = now.day() === 6;

    const userEntryTime = isSaturday && currentUserData.horarioEntradaSabado
        ? currentUserData.horarioEntradaSabado
        : currentUserData.horarioEntrada1;

    const expectedEntryTime = dayjs(userEntryTime, 'HH:mm');
    const latenessMinutes = now.diff(expectedEntryTime, 'minute');

    const processClockIn = async (policy, deduction, justification) => {
        const newRecord = createNewRecord(now, latenessMinutes, policy, deduction, justification);
        await saveRecord(newRecord);
        const userRef = doc(db, "users", currentUserData.uid);
        await updateDoc(userRef, { statusPonto: 'trabalhando' });
        updateUIForActiveSession(newRecord);
    };

    if (latenessMinutes > config.toleranciaMinutos) {
        showLatenessModal(latenessMinutes, processClockIn);
    } else {
        await processClockIn('descontar', 0, '');
    }
}
async function handleClockOut() {
    if (!todayRecord || todayRecord.status !== 'em_andamento') return;

    const now = dayjs();
    const entryTime = dayjs(todayRecord.entrada);
    const expectedExitTime = calculateExpectedExitTime(entryTime, todayRecord);

    if (now.isBefore(expectedExitTime)) {
        showEarlyLeaveModal(now, expectedExitTime);
        return;
    }

    let overtimeMinutes = now.diff(expectedExitTime, 'minute');
    if (overtimeMinutes < 0) overtimeMinutes = 0;

    todayRecord.saida = now.toISOString();
    todayRecord.status = 'completo';
    todayRecord.horasExtras = overtimeMinutes;

    await saveRecord(todayRecord);

    const newCredit = (currentUserData.creditoHoras || 0) + overtimeMinutes;
    const userRef = doc(db, "users", currentUserData.uid);
    await updateDoc(userRef, {
        creditoHoras: newCredit,
        statusPonto: 'ausente'
    });

    updateUIForSessionEnd();
}
// --- Modais e Funções de Suporte ---

function showLatenessModal(latenessMinutes, processClockInCallback) {
    const modal = document.getElementById('latenessModal');
    const justificationText = document.getElementById('justificationText');
    justificationText.value = '';
    document.getElementById('latenessModalText').textContent = `Você está ${latenessMinutes} minutos atrasado. O que deseja fazer?`;

    const minuteValue = calculateMinuteValue(currentUserData.salarioFixo);
    const deduction = latenessMinutes * minuteValue;
    const deductBtn = document.getElementById('deductSalaryButton');
    deductBtn.textContent = `Descontar R$ ${deduction.toFixed(2)} do Salário`;

    const now = dayjs();
    const isSaturday = now.day() === 6;
    const userExitTime = isSaturday && currentUserData.horarioSaidaSabado 
        ? currentUserData.horarioSaidaSabado 
        : currentUserData.horarioSaida1;
        
    const newExitTime = dayjs(userExitTime, 'HH:mm').add(latenessMinutes, 'minute');
    const compensateBtn = document.getElementById('compensateTimeButton');
    compensateBtn.textContent = `Repor ao Final do Dia (Saída às ${newExitTime.format('HH:mm')})`;

    deductBtn.onclick = async () => {
        const justification = justificationText.value.trim();
        await processClockInCallback('descontar', deduction, justification);
        modal.classList.add('hidden');
    };

    compensateBtn.onclick = async () => {
        const justification = justificationText.value.trim();
        await processClockInCallback('repor', 0, justification);
        modal.classList.add('hidden');
    };
    modal.classList.remove('hidden');
}

function showEarlyLeaveModal(exitTime, expectedExitTime) {
    const modal = document.getElementById('earlyLeaveModal');
    const justificationText = document.getElementById('earlyLeaveJustificationText');
    const errorText = document.getElementById('earlyLeaveErrorText');
    justificationText.value = '';
    errorText.textContent = '';

    const confirmBtn = document.getElementById('confirmEarlyLeaveButton');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', async () => {
        const justification = justificationText.value.trim();
        if (!justification) {
            errorText.textContent = 'A justificativa é obrigatória.';
            return;
        }

        const minutesLeft = expectedExitTime.diff(exitTime, 'minute');

        todayRecord.saida = exitTime.toISOString();
        todayRecord.status = 'completo_antecipado';
        todayRecord.justificativaSaida = justification;
        todayRecord.minutosSaidaAntecipada = minutesLeft;

        await saveRecord(todayRecord);

        const userRef = doc(db, "users", currentUserData.uid);
        await updateDoc(userRef, { statusPonto: 'ausente' });

        updateUIForSessionEnd();
        modal.classList.add('hidden');
    });

    modal.classList.remove('hidden');
}

function showAbsenceJustificationModal(dateStr) {
    const modal = document.getElementById('absenceJustificationModal');
    modal.dataset.date = dateStr;
    document.getElementById('absenceJustificationDateText').textContent = `Data: ${dayjs(dateStr).format('DD/MM/YYYY')}`;
    document.getElementById('absenceJustificationText').value = '';
    document.getElementById('absenceJustificationErrorText').textContent = '';
    modal.classList.remove('hidden');
}

async function handleAbsenceJustification() {
    const modal = document.getElementById('absenceJustificationModal');
    const dateStr = modal.dataset.date;
    const justification = document.getElementById('absenceJustificationText').value.trim();

    if (!justification) {
        document.getElementById('absenceJustificationErrorText').textContent = 'A justificativa é obrigatória.';
        return;
    }

    const recordId = `${currentUserData.uid}_${dateStr}`;
    const recordRef = doc(db, "registrosPonto", recordId);
    await setDoc(recordRef, {
        id: dateStr,
        employeeId: currentUserData.uid,
        data: dayjs(dateStr).toDate(),
        status: 'falta_justificada',
        justificativa: justification,
        aprovadoPorAdm: false,
        entrada: null,
        saida: null,
        minutosAtrasado: 0,
        horasExtras: 0
    });
    modal.classList.add('hidden');
}


function createNewRecord(entryTime, latenessMinutes, policy, deduction, justification) {
    const todayId = entryTime.format('YYYY-MM-DD');
    return {
        id: todayId,
        employeeId: currentUserData.uid,
        data: entryTime.toDate(),
        entrada: entryTime.toISOString(),
        saida: null,
        minutosAtrasado: latenessMinutes > 0 ? latenessMinutes : 0,
        politicaAtrasoDia: policy,
        valorDesconto: deduction,
        horasExtras: 0,
        justificativa: justification || null,
        aprovadoPorAdm: justification ? false : null,
        status: 'em_andamento'
    };
}

async function saveRecord(record) {
    try {
        const docRef = doc(db, "registrosPonto", `${currentUserData.uid}_${record.id}`);
        await setDoc(docRef, record, { merge: true });
        todayRecord = record;
    } catch (error) {
        console.error("Error saving record: ", error);
        document.getElementById('clockMessage').textContent = "Erro ao salvar o registro. Tente novamente.";
    }
}
// --- Funções de Atualização da Interface (UI) ---

function updateUIForActiveSession(record) {
    document.getElementById('clockInButton').classList.add('hidden');
    document.getElementById('clockOutButton').classList.remove('hidden');
    document.getElementById('clockMessage').textContent = `Entrada registrada às ${dayjs(record.entrada).format('HH:mm')}. Bom trabalho!`;
    document.getElementById('statusDot').className = 'status-dot status-green';
    document.getElementById('statusText').textContent = 'Trabalhando';
    const expectedExit = calculateExpectedExitTime(dayjs(record.entrada), record);
    document.getElementById('expectedLeaveTime').textContent = `Saída Prevista: ${expectedExit.format('HH:mm')}`;
    startWorkTimer(record.entrada);
}

function updateUIForSessionEnd() {
    stopWorkTimer();
    document.getElementById('clockOutButton').classList.add('hidden');
    document.getElementById('clockInButton').classList.add('hidden');
    disableClockInButton("Jornada de hoje finalizada. Bom trabalho! 👏");
    document.getElementById('statusDot').className = 'status-dot status-gray';
    document.getElementById('statusText').textContent = 'Saída Registrada';
    updateTimeCreditUI(currentUserData.creditoHoras);
}

function updateMonthlySummary(records) {
    let monthlyLatenessCount = 0;
    let monthlyDeduction = 0;
    let hasLatenessThisMonth = false;
    const currentMonth = dayjs().month();
    const currentYear = dayjs().year();

    records.forEach(record => {
        if (record.data) {
            const recordDate = dayjs(record.data.toDate());
            if (recordDate.month() === currentMonth && recordDate.year() === currentYear) {
                if (record.minutosAtrasado > config.toleranciaMinutos) {
                    hasLatenessThisMonth = true;
                    monthlyLatenessCount++;
                }
                monthlyDeduction += record.valorDesconto || 0;
            }
        }
    });

    document.getElementById('monthlyLatenessCount').textContent = monthlyLatenessCount;
    document.getElementById('monthlyDeduction').textContent = `R$ ${monthlyDeduction.toFixed(2)}`;

    const bonusEl = document.getElementById('punctualityBonus');
    if (bonusEl) {
        const bonusValue = config.punctualityBonusValue || 50;
        bonusEl.textContent = hasLatenessThisMonth
            ? 'Não'
            : `Sim (+ R$${bonusValue.toFixed(2)})`;
    }
}

function updateWeeklyHistory(records) {
    const historyContainer = document.getElementById('weeklyHistory');
    if (!historyContainer) return;
    historyContainer.innerHTML = '';
    const last7Days = Array.from({ length: 7 }, (_, i) => dayjs().subtract(i, 'day'));

    last7Days.forEach(day => {
        const record = records.find(r => r.data && dayjs(r.data.toDate()).isSame(day, 'day'));
        let recordEl;
        if (record) {
            const entry = record.entrada ? dayjs(record.entrada).format('HH:mm') : '--:--';
            const exit = record.saida ? dayjs(record.saida).format('HH:mm') : '--:--';
            let statusClass = 'status-green';
            let statusText = 'No Horário';

            if (record.status === 'falta_rejeitada') {
                statusClass = 'status-red';
                statusText = 'Falta (Justificativa Rejeitada)';
            } else if (record.status === 'falta_justificada') {
                statusClass = 'status-yellow';
                statusText = 'Falta Justificada (Pendente)';
            } else if (record.status === 'falta_abonada') {
                statusClass = 'status-blue';
                statusText = 'Falta Abonada';
            } else if (record.minutosAtrasado > config.toleranciaMinutos) {
                statusClass = 'status-red';
                statusText = `Atraso (${record.minutosAtrasado} min)`;
            } else if (record.minutosAtrasado > 0) {
                statusClass = 'status-yellow';
                statusText = `Tolerância (${record.minutosAtrasado} min)`;
            }
            recordEl = document.createElement('div');
            recordEl.className = 'flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg';
            recordEl.innerHTML = `
                <div>
                    <p class="font-semibold text-gray-800 dark:text-white">${day.format('dddd, DD/MM')}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">Entrada: ${entry} | Saída: ${exit}</p>
                </div>
                <div class="flex items-center">
                    <span class="status-dot ${statusClass}"></span>
                    <span class="text-sm font-medium">${statusText}</span>
                </div>
            `;
        } else if (config.diasTrabalho.includes(day.day()) && !allAbsences.some(abs => abs.date === day.format('YYYY-MM-DD'))) {
            recordEl = document.createElement('div');
            recordEl.className = 'flex justify-between items-center p-3 bg-red-50 dark:bg-red-900/50 rounded-lg';
            recordEl.innerHTML = `
                <div>
                    <p class="font-semibold text-gray-800 dark:text-white">${day.format('dddd, DD/MM')}</p>
                    <p class="text-sm text-red-500 dark:text-red-300">Falta</p>
                </div>
                <button data-action="justify-absence" data-date="${day.format('YYYY-MM-DD')}" class="btn btn-secondary btn-sm text-xs py-1 px-2">Justificar</button>
            `;
        }

        if (recordEl) historyContainer.appendChild(recordEl);
    });
}

function checkClockInAvailability(now) {
    const clockInBtn = document.getElementById('clockInButton');
    if (!clockInBtn || (todayRecord && todayRecord.status !== 'falta')) {
        disableClockInButton("Jornada de hoje já iniciada ou finalizada.");
        return;
    }

    if (allAbsences.some(abs => abs.date === now.format('YYYY-MM-DD') && (abs.appliesTo === 'todos' || abs.appliesTo === currentUserData.uid))) {
        disableClockInButton("Hoje é um dia de folga geral.");
        return;
    }

    if (!config.diasTrabalho.includes(now.day())) {
        disableClockInButton("Fora do dia de trabalho.");
        return;
    }

    const isSaturday = now.day() === 6;
    const userEntryTime = isSaturday && currentUserData.horarioEntradaSabado
        ? currentUserData.horarioEntradaSabado
        : currentUserData.horarioEntrada1;

    if (!userEntryTime) {
        disableClockInButton("Horário de entrada não configurado para hoje.");
        return;
    }

    const startTime = dayjs(userEntryTime, 'HH:mm').subtract(30, 'minute');
    const endTime = dayjs(userEntryTime, 'HH:mm').add(120, 'minute');

    if (now.isAfter(startTime) && now.isBefore(endTime)) {
        enableClockInButton();
    } else {
        disableClockInButton(`Fora do horário (${startTime.format('HH:mm')} - ${endTime.format('HH:mm')})`);
    }
}

function enableClockInButton() {
    const clockInBtn = document.getElementById('clockInButton');
    if (clockInBtn) {
        clockInBtn.disabled = false;
        clockInBtn.classList.remove('btn-disabled');
        document.getElementById('clockMessage').textContent = "Você já pode registrar sua entrada.";
    }
}

function disableClockInButton(message) {
    const clockInBtn = document.getElementById('clockInButton');
    if (clockInBtn) {
        clockInBtn.disabled = true;
        clockInBtn.classList.add('btn-disabled');
        document.getElementById('clockMessage').textContent = message;
    }
}

function calculateExpectedExitTime(entryTime, record) {
    const now = dayjs();
    const isSaturday = now.day() === 6;
    const userExitTime = isSaturday && currentUserData.horarioSaidaSabado 
        ? currentUserData.horarioSaidaSabado 
        : currentUserData.horarioSaida1;
        
    let expectedExit = dayjs(userExitTime, 'HH:mm');

    if (record.politicaAtrasoDia === 'repor' && record.minutosAtrasado > config.toleranciaMinutos) {
        expectedExit = expectedExit.add(record.minutosAtrasado, 'minute');
    }
    return expectedExit;
}

function calculateMinuteValue(salary) {
    if (!salary || salary <= 0) return 0;
    const monthlyHours = 22 * 8; // Média de horas de trabalho no mês
    const hourlyRate = salary / monthlyHours;
    return hourlyRate / 60;
}

function stopWorkTimer() {
    if (workInterval) clearInterval(workInterval);
}

function startWorkTimer(startTime) {
    if (workInterval) clearInterval(workInterval);
    const start = dayjs(startTime);
    workInterval = setInterval(() => {
        const now = dayjs();
        const diff = now.diff(start);
        const duration = new Date(diff);
        const hours = String(duration.getUTCHours()).padStart(2, '0');
        const minutes = String(duration.getUTCMinutes()).padStart(2, '0');
        const seconds = String(duration.getUTCSeconds()).padStart(2, '0');
        document.getElementById('workTimer').textContent = `${hours}:${minutes}:${seconds}`;
    }, 1000);
}

function updateTimeCreditUI(totalMinutes) {
    const timeCreditEl = document.getElementById('timeCredit');
    if (!timeCreditEl || totalMinutes === undefined) return;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    timeCreditEl.textContent = `${hours}h ${String(minutes).padStart(2, '0')}m`;
}