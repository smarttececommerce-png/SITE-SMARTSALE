// ponto/scripts/admin.js
import { db } from './firebase-config.js';
import { checkAuth, logout, setupThemeToggle, initializeDayjs } from './main.js';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, query, getDocs, deleteDoc, collection, where, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let currentUserData;

// 1. Ponto de entrada: verifica a autenticação e os dados do utilizador.
checkAuth((userData) => {
    // Se o utilizador não for um administrador, redireciona para o dashboard do funcionário.
    if (!userData || userData.role !== 'admin') {
        window.location.href = 'dashboard.html';
        return;
    }
    // Se for um administrador, armazena os dados e inicializa o painel.
    currentUserData = userData;
    initializeAdminPanel();
});


// Variáveis globais para o admin
let allUsers = [];
let allAbsences = [];
let latenessChartInstance;
let currentDeleteAction = null;
let config = {};
let usersListener = null;
let absencesListener = null;
let recordsListener = null;

let calendarState = {
    year: dayjs().year(),
    month: dayjs().month(),
    records: [],
};

// 2. Função de inicialização do painel de administração
function initializeAdminPanel() {
    initializeDayjs();
    setupThemeToggle();
    document.getElementById('logoutButton')?.addEventListener('click', logout);
    loadAdminData();
    listenToUsers();
    listenToAbsences();
    listenToRecordsForAdmin();

    document.getElementById('createUserForm')?.addEventListener('submit', handleCreateUser);
    document.getElementById('createAbsenceForm')?.addEventListener('submit', handleCreateAbsence);
    document.getElementById('saveSettings')?.addEventListener('click', saveAdminSettings);
    document.getElementById('generateReportBtn')?.addEventListener('click', generateReport);
    
    document.getElementById('calendar-prev-month')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('calendar-next-month')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('calendar-user-select')?.addEventListener('change', renderCalendar);

    document.getElementById('userList')?.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        const { action, userId } = button.dataset;
        if (action === 'edit-user' && userId) {
            const user = allUsers.find(u => u.uid === userId);
            if (user) openEditUserModal(user);
        } else if (action === 'delete-user' && userId) {
            confirmDeleteUser(userId);
        }
    });

    document.getElementById('absenceList')?.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        const { action, id } = button.dataset;
        if (action === 'delete-absence' && id) {
            confirmDeleteAbsence(id);
        }
    });

    document.getElementById('pendingJustifications')?.addEventListener('click', handleJustificationAction);
    document.getElementById('editUserForm')?.addEventListener('submit', handleEditUser);
    document.getElementById('cancelEditUser')?.addEventListener('click', () => document.getElementById('editUserModal').classList.add('hidden'));
    
    document.getElementById('confirmDelete')?.addEventListener('click', () => {
        if (currentDeleteAction) currentDeleteAction();
        document.getElementById('confirmDeleteModal').classList.add('hidden');
    });
    document.getElementById('cancelDelete')?.addEventListener('click', () => document.getElementById('confirmDeleteModal').classList.add('hidden'));
}


// --- FUNÇÕES DO PAINEL DO ADMIN ---

async function loadAdminData() {
    const configRef = doc(db, "configuracaoPonto", "default");
    const configSnap = await getDoc(configRef);
    if (configSnap.exists()) {
        config = configSnap.data();
        document.getElementById('tolerancia').value = config.toleranciaMinutos;
        document.getElementById('valorHoraExtra').value = config.valorHoraExtra;
        document.getElementById('punctualityBonusValue').value = config.punctualityBonusValue;
    }
}

function listenToUsers() {
    if (usersListener) usersListener();
    const q = query(collection(db, "users"));
    usersListener = onSnapshot(q, (querySnapshot) => {
        const userListEl = document.getElementById('userList');
        const absenceUserSelect = document.getElementById('absenceAppliesTo');
        const reportUserSelect = document.getElementById('reportUser');
        const calendarUserSelect = document.getElementById('calendar-user-select');

        if (!userListEl || !absenceUserSelect || !reportUserSelect || !calendarUserSelect) return;

        userListEl.innerHTML = '';
        allUsers = [];
        
        const selectsToClear = [absenceUserSelect, reportUserSelect, calendarUserSelect];
        selectsToClear.forEach(sel => {
            const isAbsenceSelect = sel.id === 'absenceAppliesTo';
            while (sel.options.length > (isAbsenceSelect ? 1 : 0)) {
                sel.remove(isAbsenceSelect ? sel.options.length - 1 : 0);
            }
        });

        querySnapshot.forEach((doc) => {
            const user = doc.data();
            allUsers.push(user);
            
            let horarioStr = `${user.horarioEntrada1 || '--:--'}-${user.horarioSaida1 || '--:--'}`;
            if (user.horarioEntrada2 && user.horarioSaida2) {
                horarioStr += ` | ${user.horarioEntrada2}-${user.horarioSaida2}`;
            }

            const userDiv = document.createElement('div');
            userDiv.className = "user-item";
            userDiv.innerHTML = `
                <div>
                    <div class="font-semibold text-sm">${user.nomeFantasia} (${user.role || 'vendedor'})</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">${user.email}</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">${horarioStr} | R$ ${(user.salarioFixo || 0).toFixed(2)}</div>
                </div>
                <div class="flex space-x-2">
                    <button data-action="edit-user" data-user-id="${user.uid}" class="btn btn-sm btn-secondary">✏️</button>
                    <button data-action="delete-user" data-user-id="${user.uid}" class="btn btn-sm btn-danger">🗑️</button>
                </div>
            `;
            userListEl.appendChild(userDiv);
            
            const option = document.createElement('option');
            option.value = user.uid;
            option.textContent = user.nomeFantasia;
            absenceUserSelect.appendChild(option.cloneNode(true));
            reportUserSelect.appendChild(option.cloneNode(true));
            calendarUserSelect.appendChild(option.cloneNode(true));
        });
        
        renderCalendar();
    });
}

function listenToAbsences() {
    if (absencesListener) absencesListener();
    const q = query(collection(db, "ausencias"));
    absencesListener = onSnapshot(q, (querySnapshot) => {
        const absenceListEl = document.getElementById('absenceList');
        if (!absenceListEl) return;
        absenceListEl.innerHTML = '';
        allAbsences = [];
        querySnapshot.forEach((doc) => {
            const absence = { id: doc.id, ...doc.data() };
            allAbsences.push(absence);
            const li = document.createElement('li');
            li.className = "flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-700 rounded";
            li.innerHTML = `
                <span class="flex-1">${dayjs(absence.date).format('DD/MM/YYYY')} - ${absence.description} (${absence.appliesTo})</span>
                <button data-action="delete-absence" data-id="${doc.id}" class="text-red-500 hover:text-red-700 ml-2">&times;</button>
            `;
            absenceListEl.appendChild(li);
        });
    });
}

function listenToRecordsForAdmin() {
    if (recordsListener) recordsListener();
    const q = query(collection(db, "registrosPonto"));
    recordsListener = onSnapshot(q, (querySnapshot) => {
        const allRecords = [];
        querySnapshot.forEach((doc) => {
            if (doc.data().data) {
                allRecords.push(doc.data());
            }
        });
        
        calendarState.records = allRecords;
        renderCalendar();

        const sortedRecords = allRecords.sort((a, b) => dayjs(b.data.toDate()).diff(dayjs(a.data.toDate())));
        updatePendingJustifications(sortedRecords);
        updateAnalyticsChart(sortedRecords);
        updateWorkingNowPanel(allRecords);
    });
}

function updateWorkingNowPanel(records) {
    const workingNowCountEl = document.getElementById('workingNowCount');
    const workingNowListEl = document.getElementById('workingNowList');
    if (!workingNowCountEl || !workingNowListEl) return;

    const workingNowRecords = records.filter(record => record.status === 'em_andamento');
    workingNowCountEl.textContent = workingNowRecords.length;
    workingNowListEl.innerHTML = '';

    if (workingNowRecords.length === 0) {
        workingNowListEl.innerHTML = '<p class="text-center text-gray-500">Nenhum funcionário trabalhando no momento.</p>';
    } else {
        workingNowRecords.forEach(record => {
            const user = allUsers.find(u => u.uid === record.employeeId);
            const entryTime = dayjs(record.entrada).format('HH:mm');
            const userDiv = document.createElement('div');
            userDiv.className = 'flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded';
            userDiv.innerHTML = `
                <span class="font-medium text-gray-800 dark:text-gray-200">${user?.nomeFantasia || record.employeeId}</span>
                <span class="text-gray-600 dark:text-gray-400">Entrada: <strong>${entryTime}</strong></span>
            `;
            workingNowListEl.appendChild(userDiv);
        });
    }
}

function updatePendingJustifications(records) {
    const container = document.getElementById('pendingJustifications');
    if(!container) return;
    const pending = records.filter(r => r.justificativa && r.aprovadoPorAdm === false);
    container.innerHTML = '';

    if (pending.length === 0) {
        container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center">Nenhuma justificativa pendente.</p>';
        return;
    }

    pending.forEach(record => {
        const user = allUsers.find(u => u.uid === record.employeeId);
        const el = document.createElement('div');
        el.className = 'p-3 bg-yellow-50 dark:bg-yellow-900/50 rounded-lg border border-yellow-200 dark:border-yellow-800 pending-item';
        el.dataset.recordId = record.id;
        el.dataset.employeeId = record.employeeId;
        el.innerHTML = `
            <p class="font-semibold text-sm">${user?.nomeFantasia || record.employeeId} - ${dayjs(record.data.toDate()).format('DD/MM/YYYY')}</p>
            <p class="text-xs text-gray-600 dark:text-gray-300 my-1">"${record.justificativa}"</p>
            <div class="flex justify-end space-x-2 mt-2">
                <button data-action="approve" class="approve-btn text-xs bg-green-500 text-white px-2 py-1 rounded">Aprovar</button>
                <button data-action="reject" class="reject-btn text-xs bg-red-500 text-white px-2 py-1 rounded">Rejeitar</button>
            </div>
        `;
        container.appendChild(el);
    });
}

async function handleJustificationAction(e) {
    if (!e.target.matches('.approve-btn, .reject-btn')) return;
    
    const action = e.target.dataset.action;
    const pendingItem = e.target.closest('.pending-item');
    const recordId = pendingItem.dataset.recordId;
    const employeeId = pendingItem.dataset.employeeId;
    const docRef = doc(db, "registrosPonto", `${employeeId}_${recordId}`);
    
    try {
        const recordSnap = await getDoc(docRef);
        if (!recordSnap.exists()) {
            console.error("Registro não encontrado!");
            return;
        }

        const recordData = recordSnap.data();
        if (recordData.status === 'falta_justificada') {
            if (action === 'approve') {
                await updateDoc(docRef, { aprovadoPorAdm: true, status: 'falta_abonada' });
            } else { // reject
                await deleteDoc(docRef);
            }
        } 
        else { // Justificativa de atraso ou saída antecipada
            if (action === 'approve') {
                await updateDoc(docRef, { aprovadoPorAdm: true, valorDesconto: 0 });
            } else { // reject
                await updateDoc(docRef, { aprovadoPorAdm: null, justificativa: `${recordData.justificativa} (Rejeitada)` }); 
            }
        }
    } catch (error) {
        console.error("Error updating justification: ", error);
        alert('Erro ao processar justificativa.');
    }
}

// Note: A criação de usuários agora é feita no hub principal (main.js)
// Esta função foi removida para centralizar a lógica.
async function handleCreateUser(event) {
    event.preventDefault();
    alert("A criação de usuários deve ser feita na tela de login/registo do Hub principal.");
}


function openEditUserModal(user) {
    document.getElementById('editUserId').value = user.uid;
    document.getElementById('editUserNome').value = user.nomeFantasia;
    document.getElementById('editUserRole').value = user.role || 'vendedor';
    document.getElementById('editUserSalary').value = user.salarioFixo;
    
    document.getElementById('editUserEntryTime1').value = user.horarioEntrada1 || '';
    document.getElementById('editUserLeaveTime1').value = user.horarioSaida1 || '';
    document.getElementById('editUserEntryTime2').value = user.horarioEntrada2 || '';
    document.getElementById('editUserLeaveTime2').value = user.horarioSaida2 || '';
    
    document.getElementById('editUserModal').classList.remove('hidden');
}

async function handleEditUser(event) {
    event.preventDefault();
    const uid = document.getElementById('editUserId').value;
    const nomeFantasia = document.getElementById('editUserNome').value.trim();
    const role = document.getElementById('editUserRole').value;
    const salarioFixo = parseFloat(document.getElementById('editUserSalary').value);

    const horarioEntrada1 = document.getElementById('editUserEntryTime1').value || null;
    const horarioSaida1 = document.getElementById('editUserLeaveTime1').value || null;
    const horarioEntrada2 = document.getElementById('editUserEntryTime2').value || null;
    const horarioSaida2 = document.getElementById('editUserLeaveTime2').value || null;

    if (!nomeFantasia || isNaN(salarioFixo) || !horarioEntrada1 || !horarioSaida1) {
        alert('Preencha pelo menos nome, salário e o turno da manhã.');
        return;
    }

    try {
        const updateData = { 
            nomeFantasia, 
            role,
            salarioFixo, 
            horarioEntrada1, 
            horarioSaida1,
            horarioEntrada2,
            horarioSaida2,
            atualizadoEm: new Date().toISOString()
        };
        
        const userRef = doc(db, "users", uid);
        await updateDoc(userRef, updateData);
        document.getElementById('editUserModal').classList.add('hidden');
    } catch (error) {
        console.error("Erro ao atualizar usuário:", error);
        alert('Erro ao atualizar usuário.');
    }
}

function confirmDeleteUser(userId) {
    const user = allUsers.find(u => u.uid === userId);
    showConfirmDeleteModal(`Tem certeza que deseja excluir o usuário "${user.nomeFantasia}"? Esta ação não pode ser desfeita.`, async () => {
        try {
            const userRef = doc(db, "users", userId);
            await deleteDoc(userRef);
            // ATENÇÃO: Isto não remove o usuário do Firebase Auth. 
            // A exclusão no Auth requer um ambiente de backend (Cloud Functions) por segurança.
            alert("Usuário removido do banco de dados. A remoção da autenticação deve ser feita manualmente ou via backend.");
        } catch (error) {
            console.error("Erro ao deletar usuário:", error);
            alert('Erro ao deletar usuário.');
        }
    });
}

async function handleCreateAbsence(event) {
    event.preventDefault();
    const date = document.getElementById('absenceDate').value;
    const description = document.getElementById('absenceDescription').value.trim();
    const appliesTo = document.getElementById('absenceAppliesTo').value;
    
    if (!date || !description) {
        alert('Preencha todos os campos.');
        return;
    }

    try {
        const absenceId = `${date}_${appliesTo}_${Date.now()}`;
        const absenceRef = doc(db, "ausencias", absenceId);
        await setDoc(absenceRef, { 
            date, 
            description, 
            appliesTo,
            criadoEm: new Date().toISOString()
        });
        event.target.reset();
        document.getElementById('absenceDate').value = dayjs().format('YYYY-MM-DD');
    } catch (error) {
        console.error("Erro ao criar ausência:", error);
        alert('Erro ao criar ausência.');
    }
}

function confirmDeleteAbsence(absenceId) {
    showConfirmDeleteModal('Tem certeza que deseja remover esta ausência?', async () => {
        try {
            const absenceRef = doc(db, "ausencias", absenceId);
            await deleteDoc(absenceRef);
        } catch (error) {
            console.error("Erro ao remover ausência:", error);
            alert('Erro ao remover ausência.');
        }
    });
}

function showConfirmDeleteModal(message, onConfirm) {
    document.getElementById('confirmDeleteText').textContent = message;
    currentDeleteAction = onConfirm;
    document.getElementById('confirmDeleteModal').classList.remove('hidden');
}

function changeMonth(direction) {
    const newDate = dayjs().year(calendarState.year).month(calendarState.month).add(direction, 'month');
    calendarState.year = newDate.year();
    calendarState.month = newDate.month();
    renderCalendar();
}

function renderCalendar() {
    const userSelect = document.getElementById('calendar-user-select');
    if (!userSelect || !userSelect.value) return; 
    
    const selectedUserId = userSelect.value;
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('calendar-month-year');
    grid.innerHTML = '';
    
    const currentDate = dayjs().year(calendarState.year).month(calendarState.month);
    title.textContent = currentDate.format('MMMM YYYY');
    
    const firstDayOfMonth = currentDate.startOf('month').day();
    const daysInMonth = currentDate.daysInMonth();
    
    for (let i = 0; i < firstDayOfMonth; i++) {
        grid.appendChild(document.createElement('div'));
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        const date = currentDate.date(day);
        
        cell.innerHTML = `<div class="cal-day">${day}</div>`;
        if (date.isSame(dayjs(), 'day')) {
            cell.classList.add('today');
        }

        const record = calendarState.records.find(r => r.employeeId === selectedUserId && dayjs(r.data.toDate()).isSame(date, 'day'));
        
        if (record) {
            const statusDot = document.createElement('div');
            statusDot.className = 'cal-status-dot';
            if (record.status === 'completo') statusDot.classList.add('status-green');
            else if (record.minutosAtrasado > 0) statusDot.classList.add('status-red');
            else if (record.status === 'falta_justificada') statusDot.classList.add('status-yellow');
            else if (record.status === 'falta_abonada') statusDot.classList.add('status-blue');
            cell.appendChild(statusDot);
        }
        
        cell.addEventListener('click', () => showRecordDetails(selectedUserId, date));
        grid.appendChild(cell);
    }
}

async function showRecordDetails(userId, date) {
    const detailsArea = document.getElementById('calendar-record-details');
    detailsArea.classList.remove('hidden');
    detailsArea.innerHTML = `<p class="text-center text-gray-500">Carregando detalhes para ${date.format('DD/MM/YYYY')}...</p>`;
    
    const dateStr = date.format('YYYY-MM-DD');
    const recordId = `${userId}_${dateStr}`;
    const recordRef = doc(db, "registrosPonto", recordId);
    const docSnap = await getDoc(recordRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        detailsArea.innerHTML = `
            <h4 class="font-bold">Detalhes do Dia: ${date.format('DD/MM/YYYY')}</h4>
            <div class="text-sm mt-2">
                <p><strong>Status:</strong> ${data.status || 'N/A'}</p>
                <p><strong>Entrada:</strong> ${data.entrada ? dayjs(data.entrada).format('HH:mm:ss') : '--:--'}</p>
                <p><strong>Saída:</strong> ${data.saida ? dayjs(data.saida).format('HH:mm:ss') : '--:--'}</p>
                <p><strong>Justificativa:</strong> ${data.justificativa || 'Nenhuma'}</p>
            </div>
            <button class="btn btn-danger btn-sm mt-4 w-full" data-action="delete">Deletar Registro Existente</button>
        `;
        detailsArea.querySelector('button[data-action="delete"]').addEventListener('click', () => {
            showConfirmDeleteModal(`Deletar o registro do dia ${dateStr} para ${userId}?`, async () => {
                await deleteDoc(recordRef);
                detailsArea.innerHTML = '<p class="text-center text-green-500">Registro deletado!</p>';
            });
        });
    } else {
        detailsArea.innerHTML = `
            <h4 class="font-bold">Detalhes do Dia: ${date.format('DD/MM/YYYY')}</h4>
            <p class="text-center text-gray-500 mt-2">Nenhum registro encontrado.</p>
            <p class="text-center text-xs text-gray-400">(Falta não justificada).</p>
            <button class="btn btn-success btn-sm mt-4 w-full" data-action="approve">Abonar Falta para este Dia</button>
        `;
        detailsArea.querySelector('button[data-action="approve"]').addEventListener('click', () => {
            showConfirmDeleteModal(`Abonar a falta do dia ${dateStr} para ${userId}?`, async () => {
                const newRecord = {
                    id: dateStr,
                    employeeId: userId,
                    data: date.toDate(),
                    status: 'falta_abonada',
                    aprovadoPorAdm: true,
                    justificativa: 'Falta abonada pelo administrador.'
                };
                await setDoc(recordRef, newRecord);
                detailsArea.innerHTML = '<p class="text-center text-green-500">Falta abonada com sucesso!</p>';
            });
        });
    }
}

function updateAnalyticsChart(records) {
    const canvasEl = document.getElementById('latenessChart');
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    const last30Days = records.filter(r => r.data && dayjs(r.data.toDate()).isAfter(dayjs().subtract(30, 'days')));
    const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
    const data = [0, 0, 0, 0, 0];
    last30Days.forEach(record => {
        const dayOfWeek = dayjs(record.data.toDate()).day();
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            if (record.minutosAtrasado > config.toleranciaMinutos) {
                data[dayOfWeek - 1]++;
            }
        }
    });
    if (latenessChartInstance) latenessChartInstance.destroy();
    latenessChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Atrasos por Dia da Semana',
                data: data,
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            plugins: { legend: { display: false } }
        }
    });
}

async function saveAdminSettings() {
    const newConfig = {
        valorHoraExtra: parseFloat(document.getElementById('valorHoraExtra').value) || config.valorHoraExtra,
        toleranciaMinutos: parseInt(document.getElementById('tolerancia').value) || config.toleranciaMinutos,
        punctualityBonusValue: parseFloat(document.getElementById('punctualityBonusValue').value) || config.punctualityBonusValue,
        diasTrabalho: config.diasTrabalho || [1, 2, 3, 4, 5]
    };

    try {
        const docRef = doc(db, "configuracaoPonto", "default");
        await setDoc(docRef, newConfig, { merge: true });
        config = { ...config, ...newConfig };
        const saveBtn = document.getElementById('saveSettings');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Salvo!';
        saveBtn.classList.add('btn-success');
        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.classList.remove('btn-success');
        }, 2000);
    } catch (error) {
        console.error("Error saving settings: ", error);
        alert('Erro ao salvar configurações.');
    }
}

async function generateReport() {
    const userId = document.getElementById('reportUser').value;
    const month = document.getElementById('reportMonth').value;
    
    if (!userId || !month) {
        alert('Selecione um usuário e um mês.');
        return;
    }

    try {
        const [year, monthNum] = month.split('-');
        const startDate = dayjs(`${year}-${monthNum}-01`);
        const endDate = startDate.endOf('month');
        
        const q = query(collection(db, "registrosPonto"), where("employeeId", "==", userId));
        
        const querySnapshot = await getDocs(q);
        const records = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const recordDate = dayjs(data.data.toDate());
            if (recordDate.isSameOrAfter(startDate, 'day') && recordDate.isSameOrBefore(endDate, 'day')) {
                records.push(data);
            }
        });

        const user = allUsers.find(u => u.uid === userId);
        if (!user) {
            alert('Usuário não encontrado.');
            return;
        }

        const reportHTML = generateReportHTML(user, records, startDate, endDate);
        const reportWindow = window.open('', '_blank');
        reportWindow.document.write(reportHTML);
        reportWindow.document.close();
        
    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        alert('Erro ao gerar relatório.');
    }
}

function generateReportHTML(user, records, startDate, endDate) {
    let totalWorkedMinutes = 0;
    let totalLatenessMinutes = 0;
    let latenessDeductions = 0;
    let latenessCount = 0;
    let totalOvertimeMinutes = 0;
    let workDaysInMonth = 0;
    let presentDays = 0;
    let absenceDays = 0;

    let currentDay = startDate.clone();
    while (currentDay.isSameOrBefore(endDate)) {
        if ((config.diasTrabalho || [1, 2, 3, 4, 5]).includes(currentDay.day()) && !allAbsences.some(abs => abs.date === currentDay.format('YYYY-MM-DD') && (abs.appliesTo === 'todos' || abs.appliesTo === user.uid))) {
            workDaysInMonth++;
        }
        currentDay = currentDay.add(1, 'day');
    }

    records.forEach(record => {
        if (record.status !== 'falta' && record.status !== 'falta_justificada' && record.status !== 'falta_abonada') {
            presentDays++;
            if (record.entrada && record.saida) {
                const entryTime = dayjs(record.entrada);
                const exitTime = dayjs(record.saida);
                totalWorkedMinutes += exitTime.diff(entryTime, 'minute');
            }
            if (record.minutosAtrasado > config.toleranciaMinutos) {
                totalLatenessMinutes += record.minutosAtrasado;
                latenessCount++;
            }
            latenessDeductions += record.valorDesconto || 0;
            totalOvertimeMinutes += record.horasExtras || 0;
        } else if (record.status === 'falta_abonada') {
            presentDays++;
        }
    });

    let totalDailyMinutes = 0;
    if (user.horarioEntrada1 && user.horarioSaida1) {
        totalDailyMinutes += dayjs(user.horarioSaida1, 'HH:mm').diff(dayjs(user.horarioEntrada1, 'HH:mm'), 'minute');
    }
    if (user.horarioEntrada2 && user.horarioSaida2) {
        totalDailyMinutes += dayjs(user.horarioSaida2, 'HH:mm').diff(dayjs(user.horarioEntrada2, 'HH:mm'), 'minute');
    }

    absenceDays = workDaysInMonth - presentDays;
    const dayValue = calculateMinuteValue(user.salarioFixo, totalDailyMinutes) * totalDailyMinutes;
    const absenceDeductions = absenceDays < 0 ? 0 : absenceDays * dayValue;
    const totalDeductions = latenessDeductions + absenceDeductions;

    const totalWorkedHours = Math.floor(totalWorkedMinutes / 60);
    const totalWorkedMins = totalWorkedMinutes % 60;
    const totalOvertimeHours = Math.floor(totalOvertimeMinutes / 60);
    const totalOvertimeMins = totalOvertimeMinutes % 60;

    const overtimeValue = totalOvertimeMinutes * (config.valorHoraExtra || 0.75);
    const punctualityBonus = latenessCount === 0 ? (config.punctualityBonusValue || 50) : 0;
    const finalSalary = user.salarioFixo + overtimeValue + punctualityBonus - totalDeductions;

    return `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Relatório Mensal - ${user.nomeFantasia}</title>
            <script src="https://cdn.tailwindcss.com"><\/script>
            <link rel="stylesheet" href="style.css">
        </head>
        <body class="p-8">
            <div id="printable-report">
                <div class="text-center mb-6">
                    <h2 class="text-2xl font-bold">Relatório Mensal de Ponto</h2>
                    <p class="text-gray-600">${startDate.format('MMMM [de] YYYY')}</p>
                    <p class="text-gray-600">Funcionário: ${user.nomeFantasia}</p>
                </div>
                <div class="grid grid-cols-2 gap-6 mb-6">
                    <div class="report-section">
                        <h3 class="text-lg font-semibold mb-3">Resumo Geral</h3>
                        <ul class="space-y-2 text-sm">
                            <li><strong>Dias úteis no mês:</strong> ${workDaysInMonth}</li>
                            <li><strong>Dias trabalhados:</strong> ${presentDays}</li>
                            <li><strong>Faltas (não justificadas):</strong> ${absenceDays}</li>
                            <li><strong>Atrasos (> tolerância):</strong> ${latenessCount}</li>
                            <li><strong>Total de horas trabalhadas:</strong> ${totalWorkedHours}h ${totalWorkedMins}m</li>
                            <li><strong>Total de horas extras:</strong> ${totalOvertimeHours}h ${totalOvertimeMins}m</li>
                        </ul>
                    </div>
                    <div class="report-section">
                        <h3 class="text-lg font-semibold mb-3">Valores Financeiros</h3>
                        <ul class="space-y-2 text-sm">
                            <li><strong>Salário base:</strong> R$ ${user.salarioFixo.toFixed(2)}</li>
                            <li><strong>Valor horas extras:</strong> + R$ ${overtimeValue.toFixed(2)}</li>
                            <li><strong>Bônus pontualidade:</strong> + R$ ${punctualityBonus.toFixed(2)}</li>
                            <li><strong>Descontos por Atrasos:</strong> - R$ ${latenessDeductions.toFixed(2)}</li>
                            <li><strong>Descontos por Faltas:</strong> - R$ ${absenceDeductions.toFixed(2)}</li>
                            <li class="pt-2 border-t mt-2 font-bold"><strong>Salário final:</strong> R$ ${finalSalary.toFixed(2)}</li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="text-center mt-8 no-print">
                <button onclick="window.print()" class="btn btn-primary">Imprimir Relatório</button>
            </div>
        </body>
        </html>
    `;
}

function calculateMinuteValue(salary, totalDailyMinutes) {
    if (!salary || salary <= 0 || !totalDailyMinutes || totalDailyMinutes <= 0) return 0;
    const workDaysPerMonth = 22;
    const totalMonthlyMinutes = workDaysPerMonth * totalDailyMinutes;
    const minuteValue = salary / totalMonthlyMinutes;
    return minuteValue;
}

