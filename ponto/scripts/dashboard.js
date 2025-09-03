// ponto/scripts/dashboard.js
import { db } from './firebase-config.js';
import { checkAuth, logout, setupThemeToggle, initializeDayjs } from './main.js';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, query, where, getDocs, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let currentUserData;

// 1. Ponto de entrada principal: verifica a autenticação e, se for bem-sucedido, inicia o dashboard.
checkAuth((userData) => {
    // Se o usuário for um administrador, redireciona para a página de administração.
    if (userData && userData.role === 'admin') {
        window.location.href = 'admin.html';
        return;
    }
    // Se for um usuário normal, armazena os seus dados e inicializa o painel.
    currentUserData = userData;
    initializeDashboard();
});


// Variáveis globais para o dashboard
let todayRecord = null;
let workInterval;
let allAbsences = [];
let notificationSentToday = false;
let alarmPlayedToday = false;
let finalAlarmPlayedToday = false;
let autoClockOutTriggered = false;
let recordsListener = null;
let userListener = null;
let config = {
    toleranciaMinutos: 5,
    diasTrabalho: [1, 2, 3, 4, 5],
    punctualityBonusValue: 50,
};

// 2. Função de inicialização chamada após a autenticação bem-sucedida.
function initializeDashboard() {
    if (!currentUserData) return;

    initializeDayjs();
    setupThemeToggle();

    document.getElementById('logoutButton')?.addEventListener('click', logout);
    document.getElementById('welcomeMessage').textContent = `Bem-vindo(a), ${currentUserData.nomeFantasia || currentUserData.uid}!`;
    document.getElementById('test-sound-button')?.addEventListener('click', playAlarmSequence);

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

    document.getElementById('confirmAbsenceJustification')?.addEventListener('click', handleAbsenceJustification);
    document.getElementById('cancelAbsenceJustification')?.addEventListener('click', () => {
        document.getElementById('absenceJustificationModal').classList.add('hidden');
    });

    setInterval(updateClock, 1000);
}


// --- Seletores de elementos do DOM ---
const clockEl = document.getElementById('realTimeClock');
const dateEl = document.getElementById('currentDate');
const clockMsg = document.getElementById('clockMessage');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const workTimer = document.getElementById('workTimer');
const clockInBtn = document.getElementById('clockInButton');
const clockOutBtn = document.getElementById('clockOutButton');

// --- Funções do Dashboard ---

function listenToUserData() {
    if (userListener) userListener();
    const userRef = doc(db, "users", currentUserData.uid);
    userListener = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            console.log("Dados do usuário atualizados em tempo real:", docSnap.data());
            currentUserData = docSnap.data();
            updateTimeCreditUI(currentUserData.creditoHoras);
        }
    });
}

function playAlarmSequence() {
    const alarmSound = document.getElementById('notification-sound');
    if (alarmSound) {
        let repetitions = 0;
        const totalRepetitions = 3;
        const intervalTime = 2000;
        alarmSound.currentTime = 0;

        const intervalId = setInterval(() => {
            alarmSound.play().catch(error => console.error("Erro ao tocar o som:", error));
            repetitions++;
            if (repetitions >= totalRepetitions) {
                clearInterval(intervalId);
            }
        }, intervalTime);
    }
}

function updateClock() {
    const now = dayjs();
    if (clockEl) clockEl.textContent = now.format('HH:mm:ss');
    if (dateEl) dateEl.textContent = now.format('dddd, DD [de] MMMM');

    checkClockInAvailability(now);
    checkClockOutNotification(now);

    if (!alarmPlayedToday && currentUserData && todayRecord?.status === 'em_andamento') {
        const userLeaveTime = currentUserData.horarioSaida1;
        const alarmTime = dayjs(userLeaveTime, 'HH:mm').subtract(5, 'minute');

        if (now.isSame(alarmTime, 'minute')) {
            alarmPlayedToday = true;
            console.log("Alarme de AVISO (5 min) disparado!");
            playAlarmSequence();
        }
    }

    if (!finalAlarmPlayedToday && currentUserData && todayRecord?.status === 'em_andamento') {
        const userLeaveTime = currentUserData.horarioSaida1;
        const finalAlarmTime = dayjs(userLeaveTime, 'HH:mm');

        if (now.isSame(finalAlarmTime, 'minute')) {
            finalAlarmPlayedToday = true;
            console.log("Alarme FINAL (hora da saída) disparado!");
            playAlarmSequence();
        }
    }

    if (!autoClockOutTriggered && currentUserData && todayRecord?.status === 'em_andamento') {
        const userLeaveTime = currentUserData.horarioSaida1;
        const clockOutTime = dayjs(userLeaveTime, 'HH:mm');

        if (now.isSameOrAfter(clockOutTime)) {
            autoClockOutTriggered = true;
            showOvertimeModal();
        }
    }
}

function showOvertimeModal() {
    const modal = document.getElementById('overtimeModal');
    const countdownEl = document.getElementById('overtimeCountdown');
    const confirmOvertimeBtn = document.getElementById('confirmOvertimeButton');
    const confirmClockOutBtn = document.getElementById('confirmClockOutButton');

    modal.classList.remove('hidden');

    let countdown = 60;
    countdownEl.textContent = countdown;

    const intervalId = setInterval(() => {
        countdown--;
        countdownEl.textContent = countdown;
        if (countdown <= 0) {
            clearInterval(intervalId);
            handleClockOut();
            modal.classList.add('hidden');
        }
    }, 1000);

    confirmOvertimeBtn.onclick = () => {
        clearInterval(intervalId);
        modal.classList.add('hidden');
        console.log("Usuário escolheu iniciar horas extras.");
    };

    confirmClockOutBtn.onclick = () => {
        clearInterval(intervalId);
        handleClockOut();
        modal.classList.add('hidden');
    };
}

async function loadInitialData() {
    try {
        const configRef = doc(db, "configuracaoPonto", "default");
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
            config = { ...config, ...configSnap.data() };
        }

        const absenceQuery = query(collection(db, "ausencias"));
        const absenceSnapshot = await getDocs(absenceQuery);
        allAbsences = absenceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const todayId = dayjs().format('YYYY-MM-DD');
        const recordRef = doc(db, "registrosPonto", `${currentUserData.uid}_${todayId}`);
        const recordSnap = await getDoc(recordRef);

        if (recordSnap.exists()) {
            todayRecord = recordSnap.data();
            if (todayRecord.status === 'em_andamento') {
                updateUIForActiveSession(todayRecord);
            } else if (todayRecord.status.startsWith('completo')) {
                updateUIForSessionEnd();
                const entry = dayjs(todayRecord.entrada);
                const exit = dayjs(todayRecord.saida);
                const diff = exit.diff(entry);
                const duration = new Date(diff);
                const hours = String(duration.getUTCHours()).padStart(2, '0');
                const minutes = String(duration.getUTCMinutes()).padStart(2, '0');
                const seconds = String(duration.getUTCSeconds()).padStart(2, '0');
                workTimer.textContent = `${hours}:${minutes}:${seconds}`;
            }
        } else {
            todayRecord = { status: 'falta' };
            document.getElementById('expectedLeaveTime').textContent = `Saída Prevista: --:--`;
            clockInBtn.classList.remove('hidden');
            clockOutBtn.classList.add('hidden');
        }
    } catch (error) {
        console.error("Erro ao carregar dados iniciais:", error);
    }
}

function listenToRecords() {
    if (recordsListener) recordsListener();

    const q = query(collection(db, "registrosPonto"), where("employeeId", "==", currentUserData.uid));

    recordsListener = onSnapshot(q, (querySnapshot) => {
        const allRecords = [];
        querySnapshot.forEach((doc) => {
            if (doc.data().data) {
                allRecords.push(doc.data());
            }
        });

        const sortedRecords = allRecords.sort((a, b) => dayjs(b.data.toDate()).diff(dayjs(a.data.toDate())));

        updateMonthlySummary(sortedRecords);
        updateWeeklyHistory(sortedRecords);
    });
}

function updateWeeklyHistory(records) {
    const historyContainer = document.getElementById('weeklyHistory');
    if (!historyContainer) return;
    historyContainer.innerHTML = '';

    const last7Days = Array.from({ length: 7 }, (_, i) => dayjs().subtract(i, 'day'));

    last7Days.forEach(day => {
        const record = records.find(r => dayjs(r.data.toDate()).isSame(day, 'day'));

        let recordEl;
        if (record) {
            const entry = record.entrada ? dayjs(record.entrada).format('HH:mm') : '--:--';
            const exit = record.saida ? dayjs(record.saida).format('HH:mm') : '--:--';
            let statusClass = 'status-green';
            let statusText = 'No Horário';

            if (record.status === 'falta_justificada') {
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
        } else if (config.diasTrabalho.includes(day.day()) && !allAbsences.some(abs => abs.date === day.format('YYYY-MM-DD') && (abs.appliesTo === 'todos' || abs.appliesTo === currentUserData.uid))) {
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
    if ((todayRecord && todayRecord.status !== 'falta') || !currentUserData) return;

    if (allAbsences.some(abs => abs.date === now.format('YYYY-MM-DD') && (abs.appliesTo === 'todos' || abs.appliesTo === currentUserData.uid))) {
        disableClockInButton("Hoje é um dia de folga.");
        return;
    }

    if (!config.diasTrabalho.includes(now.day())) {
        disableClockInButton("Fora do dia de trabalho.");
        return;
    }

    const userEntryTime = currentUserData.horarioEntrada1;
    const startTime = dayjs(userEntryTime, 'HH:mm').subtract(30, 'minute');
    const endTime = dayjs(userEntryTime, 'HH:mm').add(120, 'minute');

    if (now.isAfter(startTime) && now.isBefore(endTime)) {
        enableClockInButton();
    } else {
        disableClockInButton(`Fora do horário (${startTime.format('HH:mm')} - ${endTime.format('HH:mm')}).`);
    }
}

function enableClockInButton() {
    if (clockInBtn) {
        clockInBtn.disabled = false;
        clockInBtn.classList.remove('btn-disabled');
        if (clockMsg) clockMsg.textContent = "Você já pode registrar sua entrada.";
    }
}

function disableClockInButton(message) {
    if (clockInBtn) {
        clockInBtn.disabled = true;
        clockInBtn.classList.add('btn-disabled');
        if (clockMsg) clockMsg.textContent = message;
    }
}

async function handleClockIn() {
    disableClockInButton("Registrando...");
    const now = dayjs();
    const userEntryTime = currentUserData.horarioEntrada1;
    const expectedEntryTime = dayjs(userEntryTime, 'HH:mm');
    const latenessMinutes = now.diff(expectedEntryTime, 'minute');

    if (latenessMinutes > config.toleranciaMinutos) {
        showLatenessModal(now, latenessMinutes);
    } else {
        const newRecord = createNewRecord(now, latenessMinutes, 'descontar', 0, '');
        await saveRecord(newRecord);
        updateUIForActiveSession(newRecord);
    }
}

function showLatenessModal(entryTime, latenessMinutes) {
    const modal = document.getElementById('latenessModal');
    const justificationText = document.getElementById('justificationText');
    justificationText.value = '';
    document.getElementById('latenessModalText').textContent = `Você está ${latenessMinutes} minutos atrasado. O que deseja fazer?`;

    const minuteValue = calculateMinuteValue(currentUserData.salarioFixo);
    const deduction = latenessMinutes * minuteValue;
    const deductBtn = document.getElementById('deductSalaryButton');
    deductBtn.textContent = `Descontar R$ ${deduction.toFixed(2)} do Salário`;

    const userExitTime = currentUserData.horarioSaida1;
    const newExitTime = dayjs(userExitTime, 'HH:mm').add(latenessMinutes, 'minute');
    const compensateBtn = document.getElementById('compensateTimeButton');
    compensateBtn.textContent = `Repor ao Final do Dia (Saída às ${newExitTime.format('HH:mm')})`;

    deductBtn.onclick = async () => {
        const justification = justificationText.value.trim();
        const newRecord = createNewRecord(entryTime, latenessMinutes, 'descontar', deduction, justification);
        await saveRecord(newRecord);
        updateUIForActiveSession(newRecord);
        modal.classList.add('hidden');
    };

    compensateBtn.onclick = async () => {
        const justification = justificationText.value.trim();
        const newRecord = createNewRecord(entryTime, latenessMinutes, 'repor', 0, justification);
        await saveRecord(newRecord);
        updateUIForActiveSession(newRecord);
        modal.classList.add('hidden');
    };

    modal.classList.remove('hidden');
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
    await updateDoc(userRef, { creditoHoras: newCredit });
    currentUserData.creditoHoras = newCredit;

    updateUIForSessionEnd();
}

function showEarlyLeaveModal(exitTime, expectedExitTime) {
    const modal = document.getElementById('earlyLeaveModal');
    const justificationText = document.getElementById('earlyLeaveJustificationText');
    const errorText = document.getElementById('earlyLeaveErrorText');
    justificationText.value = '';
    errorText.textContent = '';
    modal.classList.remove('hidden');

    document.getElementById('confirmEarlyLeaveButton').onclick = async () => {
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
        updateUIForSessionEnd();
        modal.classList.add('hidden');
    };
}

async function saveRecord(record) {
    try {
        const docRef = doc(db, "registrosPonto", `${currentUserData.uid}_${record.id}`);
        await setDoc(docRef, record, { merge: true });
        todayRecord = record;
    } catch (error) {
        console.error("Error saving record: ", error);
        if (clockMsg) clockMsg.textContent = "Erro ao salvar o registro. Tente novamente.";
    }
}

function updateUIForActiveSession(record) {
    requestNotificationPermission();
    if (clockInBtn) clockInBtn.classList.add('hidden');
    if (clockOutBtn) clockOutBtn.classList.remove('hidden');
    if (clockMsg) clockMsg.textContent = `Entrada registrada às ${dayjs(record.entrada).format('HH:mm')}. Bom trabalho!`;
    if (statusDot) statusDot.className = 'status-dot status-green';
    if (statusText) statusText.textContent = 'Trabalhando';

    const expectedExit = calculateExpectedExitTime(dayjs(record.entrada), record);
    document.getElementById('expectedLeaveTime').textContent = `Saída Prevista: ${expectedExit.format('HH:mm')}`;

    startWorkTimer(record.entrada);
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
        if (workTimer) workTimer.textContent = `${hours}:${minutes}:${seconds}`;
    }, 1000);
}

function stopWorkTimer() {
    clearInterval(workInterval);
}

function updateUIForSessionEnd() {
    stopWorkTimer();
    if (clockOutBtn) clockOutBtn.classList.add('hidden');
    if (clockInBtn) clockInBtn.classList.add('hidden');
    disableClockInButton("Jornada de hoje finalizada. Bom trabalho! 👏");
    if (statusDot) statusDot.className = 'status-dot status-gray';
    if (statusText) statusText.textContent = 'Saída Registrada';
    updateTimeCreditUI(currentUserData.creditoHoras);
}

function updateMonthlySummary(records) {
    let monthlyLatenessCount = 0;
    let monthlyDeduction = 0;
    let hasLatenessThisMonth = false;
    const currentMonth = dayjs().month();
    const currentYear = dayjs().year();

    records.forEach(record => {
        const recordDate = dayjs(record.data.toDate());
        if (recordDate.month() === currentMonth && recordDate.year() === currentYear) {
            if (record.minutosAtrasado > config.toleranciaMinutos) {
                monthlyLatenessCount++;
                hasLatenessThisMonth = true;
            }
            monthlyDeduction += record.valorDesconto || 0;
        }
    });

    document.getElementById('monthlyLatenessCount').textContent = monthlyLatenessCount;
    document.getElementById('monthlyDeduction').textContent = `R$ ${monthlyDeduction.toFixed(2)}`;
    document.getElementById('punctualityBonus').textContent = hasLatenessThisMonth ? 'Não' : `Sim (+ R$${config.punctualityBonusValue})`;
}

function showAbsenceJustificationModal(dateStr) {
    const modal = document.getElementById('absenceJustificationModal');
    document.getElementById('absenceJustificationDateText').textContent = `Data: ${dayjs(dateStr).format('DD/MM/YYYY')}`;
    document.getElementById('absenceJustificationText').value = '';
    document.getElementById('absenceJustificationErrorText').textContent = '';
    modal.classList.remove('hidden');
    modal.dataset.date = dateStr;
}

async function handleAbsenceJustification() {
    const modal = document.getElementById('absenceJustificationModal');
    const dateStr = modal.dataset.date;
    const justification = document.getElementById('absenceJustificationText').value.trim();
    const errorText = document.getElementById('absenceJustificationErrorText');

    if (!justification) {
        errorText.textContent = 'A justificativa é obrigatória.';
        return;
    }

    try {
        const recordId = `${currentUserData.uid}_${dateStr}`;
        const recordRef = doc(db, "registrosPonto", recordId);
        await setDoc(recordRef, {
            id: dateStr,
            employeeId: currentUserData.uid,
            data: dayjs(dateStr).toDate(),
            entrada: null,
            saida: null,
            minutosAtrasado: 0,
            politicaAtrasoDia: null,
            valorDesconto: 0,
            horasExtras: 0,
            justificativa: justification,
            aprovadoPorAdm: false,
            status: 'falta_justificada'
        });
        modal.classList.add('hidden');
    } catch (error) {
        console.error("Erro ao enviar justificativa:", error);
    }
}

function calculateExpectedExitTime(entryTime, record) {
    const userExitTime = currentUserData.horarioSaida1;
    let expectedExit = dayjs(userExitTime, 'HH:mm');
    if (record.politicaAtrasoDia === 'repor') {
        const userEntryTime = currentUserData.horarioEntrada1;
        const expectedEntry = dayjs(userEntryTime, 'HH:mm');
        const latenessMinutes = entryTime.diff(expectedEntry, 'minute');
        if (latenessMinutes > config.toleranciaMinutos) {
            expectedExit = expectedExit.add(latenessMinutes, 'minute');
        }
    }
    return expectedExit;
}

function calculateMinuteValue(salary) {
    if (!salary || salary <= 0) return 0;
    const monthlyHours = 22 * 8;
    const hourlyRate = salary / monthlyHours;
    return hourlyRate / 60;
}

function updateTimeCreditUI(totalMinutes) {
    const timeCreditEl = document.getElementById('timeCredit');
    if (!timeCreditEl || totalMinutes === undefined) return;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    timeCreditEl.textContent = `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function requestNotificationPermission() {
    if (!("Notification" in window)) {
        console.log("Este navegador não suporta notificações.");
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission();
    }
}

function checkClockOutNotification(now) {
    if (!todayRecord || todayRecord.status !== 'em_andamento' || notificationSentToday) {
        return;
    }
    const expectedExitTime = calculateExpectedExitTime(dayjs(todayRecord.entrada), todayRecord);
    if (now.isSame(expectedExitTime, 'minute')) {
        new Notification("Hora de Registrar a Saída!", {
            body: "Sua jornada de trabalho está completa. Não se esqueça de registrar sua saída.",
            icon: "https://placehold.co/96x96/1a73e8/ffffff?text=🔔"
        });
        notificationSentToday = true;
    }
}

