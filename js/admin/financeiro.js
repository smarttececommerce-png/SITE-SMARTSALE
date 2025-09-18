// js/admin/financeiro.js (Módulo Financeiro - CÁLCULO EM TEMPO REAL)

import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let db;
let getGlobalData;

/**
 * Inicializa o módulo de administração Financeiro.
 */
export function initFinanceiroAdmin(firestoreInstance, globalDataGetter) {
    db = firestoreInstance;
    getGlobalData = globalDataGetter;
    
    console.log("Módulo de Admin Financeiro inicializado.");

    // Ouve o evento de atualização de dados para redesenhar a UI
    window.addEventListener('dataUpdated', (e) => {
        const relevantData = ['users', 'ponto', 'absences', 'config', 'goals', 'products'];
        if (relevantData.includes(e.detail.dataType)) {
            displayFinancialSummary();
        }
    });
}

/**
 * Calcula e exibe o resumo financeiro de todos os funcionários.
 */
function displayFinancialSummary() {
    const container = document.getElementById('financial-summary-container');
    if (!container) return;

    const { 
        users, 
        pontoRecords = [], 
        absences = [], 
        pontoConfig = {}, 
        salesGoals = [], 
        products = [], 
    } = getGlobalData();
    
    const employees = users.filter(u => u.role !== 'admin');

    if (employees.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic">Nenhum funcionário encontrado para exibir o resumo.</p>';
        return;
    }

    container.innerHTML = employees.map(user => {
        const userPontoRecords = pontoRecords.filter(r => r.employeeId === user.id);
        const userSalesGoals = salesGoals.filter(g => g.assignedTo === user.id);
        
        // Calcula o salário base e bônus
        const salarySummary = calculateSalary(user, userPontoRecords, absences, pontoConfig, userSalesGoals, products);
        
        // --- LÓGICA DE CÁLCULO EM TEMPO REAL ---
        // Em vez de ler um valor pré-calculado, o sistema agora soma as vendas do dia.
        const today = window.dayjs();
        const startOfToday = today.startOf('day');
        const endOfToday = today.endOf('day');

        // Filtra todos os produtos para encontrar os que foram vendidos pelo usuário hoje.
        const soldToday = products.filter(p => 
            p.status === 'sold' && 
            p.soldBy === user.id && 
            p.soldAt && p.soldAt.toDate &&
            window.dayjs(p.soldAt.toDate()).isBetween(startOfToday, endOfToday, null, '[]')
        );
        
        // Calcula o total vendido e o lucro a partir dos produtos filtrados.
        salarySummary.totalVendido = soldToday.reduce((sum, p) => sum + (p.price || 0), 0);
        salarySummary.lucro = soldToday.reduce((sum, p) => sum + ((p.price || 0) - (p.cost || 0)), 0);
        // --- FIM DA LÓGICA DE CÁLCULO ---

        return createSummaryCard(salarySummary);
    }).join('');
}

/**
 * Cria o HTML para o card de resumo de um funcionário.
 */
function createSummaryCard(summary) {
    const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

    return `
        <div class="card">
            <h3 class="card-title">${summary.userName}</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-4">
                <div class="space-y-2">
                    <p class="text-sm font-semibold text-gray-400">Resumo do Ponto</p>
                    <div class="summary-item"><span>Dias trabalhados:</span><span class="font-semibold">${summary.presentDays}/${summary.workDaysInMonth}</span></div>
                    <div class="summary-item text-red-400"><span>Faltas:</span><span class="font-semibold">${summary.absenceDays}</span></div>
                    <div class="summary-item text-yellow-400"><span>Atrasos:</span><span class="font-semibold">${summary.latenessCount}</span></div>
                </div>
                <div class="space-y-2">
                    <p class="text-sm font-semibold text-gray-400">Resumo de Vendas (Hoje)</p>
                    <div class="summary-item"><span>Total Vendido:</span><span class="font-semibold">${formatCurrency(summary.totalVendido)}</span></div>
                    <div class="summary-item"><span>Lucro:</span><span class="font-semibold">${formatCurrency(summary.lucro)}</span></div>
                </div>
                <div class="space-y-2">
                    <p class="text-sm font-semibold text-gray-400">Cálculo Salarial</p>
                    <div class="summary-item"><span>Salário Base:</span><span>${formatCurrency(summary.salarioBase)}</span></div>
                    <div class="summary-item text-green-400"><span>Bônus Pontualidade:</span><span>+ ${formatCurrency(summary.punctualityBonus)}</span></div>
                    <div class="summary-item text-green-400"><span>Bônus Vendas:</span><span>+ ${formatCurrency(summary.salesBonus)}</span></div>
                    <div class="summary-item text-green-400"><span>Horas Extras:</span><span>+ ${formatCurrency(summary.overtimeValue)}</span></div>
                    <div class="summary-item text-yellow-400"><span>Desc. Atrasos:</span><span>- ${formatCurrency(summary.latenessDeductions)}</span></div>
                    <div class="summary-item text-red-400"><span>Desc. Faltas:</span><span>- ${formatCurrency(summary.absenceDeductions)}</span></div>
                </div>
                <div class="bg-gray-900 p-4 rounded-lg flex flex-col items-center justify-center">
                     <p class="text-lg font-semibold text-gray-400">Salário Final Estimado</p>
                     <p class="text-3xl font-bold text-white mt-2">${formatCurrency(summary.finalSalary)}</p>
                </div>
            </div>
        </div>
    `;
}

/**
 * Função principal que orquestra o cálculo do salário.
 */
function calculateSalary(user, records, allAbsences, pontoConfig, userGoals, allProducts) {
    const dayjs = window.dayjs;
    const startDate = dayjs().startOf('month');
    const endDate = dayjs().endOf('month');

    const pontoSummary = calculatePontoSummary(user, records, startDate, endDate, allAbsences, pontoConfig);
    const salesBonus = calculateSalesBonus(user, allProducts, userGoals);

    const finalSalary = (user.salarioFixo || 0) 
        + pontoSummary.overtimeValue 
        + pontoSummary.punctualityBonus 
        + salesBonus
        - (pontoSummary.latenessDeductions + pontoSummary.absenceDeductions);

    return {
        userName: user.nomeFantasia,
        salarioBase: user.salarioFixo || 0,
        salesBonus,
        finalSalary,
        ...pontoSummary
    };
}

/**
 * Calcula os totais relacionados ao ponto (faltas, atrasos, bónus, etc.).
 */
function calculatePontoSummary(user, records, startDate, endDate, allAbsences, pontoConfig) {
    const dayjs = window.dayjs;
    let workDaysInMonth = 0;
    
    let currentDay = startDate;
    while (currentDay.isSameOrBefore(endDate)) {
        const isGeneralAbsence = allAbsences.some(abs => abs.date === currentDay.format('YYYY-MM-DD'));
        if (isWorkDay(currentDay, user) && !isGeneralAbsence) {
            workDaysInMonth++;
        }
        currentDay = currentDay.add(1, 'day');
    }
    
    const monthRecords = records.filter(r => dayjs(r.data?.seconds * 1000).isBetween(startDate, endDate, null, '[]'));

    const presentDays = monthRecords.filter(r => r.status && !r.status.startsWith('falta')).length;
    const latenessCount = monthRecords.filter(r => r.minutosAtrasado > (pontoConfig.toleranciaMinutos || 5)).length;
    
    const totalDailyMinutes = calculateUserDailyWorkMinutes(user);
    const minuteValue = (workDaysInMonth * totalDailyMinutes) > 0 ? (user.salarioFixo || 0) / (workDaysInMonth * totalDailyMinutes) : 0;

    const latenessDeductions = monthRecords.reduce((acc, r) => acc + (r.minutosAtrasado > (pontoConfig.toleranciaMinutos || 5) ? r.minutosAtrasado * minuteValue : 0), 0);
    const overtimeValue = monthRecords.reduce((acc, r) => acc + (r.horasExtras || 0), 0) * (minuteValue * 1.5);
    
    const absenceDays = workDaysInMonth - presentDays;
    const absenceDeductions = absenceDays > 0 ? absenceDays * (totalDailyMinutes * minuteValue) : 0;
    const punctualityBonus = latenessCount === 0 && absenceDays === 0 ? (pontoConfig.punctualityBonusValue || 0) : 0;

    return { workDaysInMonth, presentDays, absenceDays, latenessCount, latenessDeductions, overtimeValue, absenceDeductions, punctualityBonus };
}

/**
 * Calcula o bónus de vendas com base nas metas e produtos vendidos na semana.
 */
function calculateSalesBonus(user, allProducts, userGoals) {
    const dayjs = window.dayjs;
    const startOfWeek = dayjs().startOf('week');
    const endOfWeek = dayjs().endOf('week');

    const soldThisWeek = allProducts.filter(p => 
        p.status === 'sold' && p.soldBy === user.id && p.soldAt && p.soldAt.toDate &&
        dayjs(p.soldAt.toDate()).isBetween(startOfWeek, endOfWeek, null, '[]')
    );

    const salesByCategory = soldThisWeek.reduce((acc, product) => {
        acc[product.category] = (acc[product.category] || 0) + 1;
        return acc;
    }, {});

    let totalBonus = 0;
    for (const category in salesByCategory) {
        const quantitySold = salesByCategory[category];
        const applicableGoal = userGoals
            .filter(goal => goal.category === category && quantitySold >= goal.quantityMin && quantitySold <= goal.quantityMax)
            .sort((a, b) => b.bonus - a.bonus)[0];

        if (applicableGoal) {
            totalBonus += applicableGoal.bonus;
        }
    }
    return totalBonus;
}

// --- Funções Utilitárias ---
function isWorkDay(date, user) {
    if (!user || !Array.isArray(user.diasTrabalho)) return false;
    const dayOfWeek = dayjs(date).day();
    return user.diasTrabalho.includes(dayOfWeek);
}

function calculateUserDailyWorkMinutes(user) {
    if (!user.horarioEntrada1 || !user.horarioSaida1) return 0;
    const dayjs = window.dayjs;
    let totalMinutes = 0;
    
    const entrada1 = dayjs(user.horarioEntrada1, 'HH:mm');
    const saida1 = dayjs(user.horarioSaida1, 'HH:mm');
    totalMinutes += saida1.diff(entrada1, 'minute');

    if (user.horarioEntrada2 && user.horarioSaida2) {
        const entrada2 = dayjs(user.horarioEntrada2, 'HH:mm');
        const saida2 = dayjs(user.horarioSaida2, 'HH:mm');
        totalMinutes += saida2.diff(entrada2, 'minute');
    }
    
    return totalMinutes;
}