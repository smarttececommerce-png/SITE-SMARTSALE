// js/admin/financeiro.js (Módulo Financeiro - VERSÃO FINAL ATUALIZADA)

import { collection, onSnapshot, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let db;
let getGlobalData;
let userMetas = [];
let salesGoals = []; // Armazena as metas de vendas configuradas
let allProducts = []; // Armazena todos os produtos

/**
 * Inicializa o módulo de administração Financeiro.
 */
export function initFinanceiroAdmin(firestoreInstance, globalDataGetter) {
    db = firestoreInstance;
    getGlobalData = globalDataGetter;
    
    console.log("Módulo de Admin Financeiro inicializado.");

    // Listeners para coleções de dados financeiros
    onSnapshot(collection(db, "userMetas"), (snapshot) => {
        userMetas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'metas' } }));
    });

    onSnapshot(collection(db, "salesGoals"), (snapshot) => {
        salesGoals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'goals' } }));
    });
    
    onSnapshot(collection(db, "products"), (snapshot) => {
        allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        window.dispatchEvent(new CustomEvent('dataUpdated', { detail: { dataType: 'products' } }));
    });
    
    // Ouve o evento de atualização de dados para redesenhar a UI
    window.addEventListener('dataUpdated', (e) => {
        const relevantData = ['users', 'ponto', 'absences', 'config', 'metas', 'goals', 'products'];
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

    const { users, pontoRecords, absences, pontoConfig } = getGlobalData();
    const dayjs = window.dayjs;
    const startDate = dayjs().startOf('month');
    const endDate = dayjs().endOf('month');

    container.innerHTML = '<p class="text-gray-400">Calculando resumos...</p>';

    const employeeSummaries = users
        .filter(u => u.role !== 'admin')
        .map(user => {
            const userRecords = pontoRecords.filter(record => {
                if (!record.data || !record.data.seconds) return false;
                const recordDate = dayjs(record.data.seconds * 1000);
                return record.employeeId === user.id && recordDate.isAfter(startDate.subtract(1, 'day')) && recordDate.isBefore(endDate.add(1, 'day'));
            });

            const metas = userMetas.find(m => m.id === user.id) || {};
            // Passa a lista global de metas para a função de cálculo
            const salarySummary = calculateSalary(user, userRecords, startDate.toDate(), endDate.toDate(), absences, pontoConfig, salesGoals);
            
            salarySummary.totalVendido = metas.totalVendidoHoje || 0;
            salarySummary.lucro = metas.lucroHoje || 0;

            return {
                userName: user.nomeFantasia,
                ...salarySummary
            };
        });

    if (employeeSummaries.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic">Nenhum funcionário encontrado para exibir o resumo.</p>';
        return;
    }
    
    container.innerHTML = employeeSummaries.map(summary => createSummaryCard(summary)).join('');
}

/**
 * Cria o HTML para o card de resumo de um funcionário.
 */
function createSummaryCard(summary) {
    const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

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

function isWorkDay(date, user) {
    if (!user || !user.diasTrabalho) return false;
    const dayjs = window.dayjs;
    const dayOfWeek = dayjs(date).day();
    return user.diasTrabalho.includes(dayOfWeek);
}

/**
 * Calcula o salário estimado com a lógica de bônus por intervalo de vendas.
 */
function calculateSalary(user, records, startDate, endDate, allAbsences, pontoConfig, salesGoals) {
    const dayjs = window.dayjs;
    
    // Cálculo do Ponto
    let latenessDeductions = 0, latenessCount = 0, totalOvertimeMinutes = 0;
    let workDaysInMonth = 0, presentDays = 0;
    
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
    const workDays = workDaysInMonth || 22;
    const minuteValue = totalDailyMinutes > 0 ? (user.salarioFixo || 0) / (workDays * totalDailyMinutes) : 0;

    records.forEach(record => {
        if (record.status && !record.status.startsWith('falta')) {
            presentDays++;
            const toleranciaMinutos = pontoConfig.toleranciaMinutos || 5;
            if (record.minutosAtrasado > toleranciaMinutos) {
                latenessCount++;
                latenessDeductions += (record.minutosAtrasado * minuteValue);
            }
            totalOvertimeMinutes += record.horasExtras || 0;
        }
    });

    const absenceDays = workDaysInMonth - presentDays;
    const dayValue = minuteValue * totalDailyMinutes;
    const absenceDeductions = absenceDays > 0 ? absenceDays * dayValue : 0;
    
    const overtimeValue = totalOvertimeMinutes * (minuteValue * 1.5);
    const punctualityBonusValue = pontoConfig.punctualityBonusValue || 50;
    const punctualityBonus = latenessCount === 0 ? punctualityBonusValue : 0;

    // LÓGICA DE BÔNUS DE VENDAS ATUALIZADA
    const startOfWeek = dayjs().startOf('week');
    const endOfWeek = dayjs().endOf('week');

    const userSoldProductsThisWeek = allProducts.filter(p => 
        p.userId === user.id && p.status === 'sold' && p.soldAt &&
        dayjs(p.soldAt.toDate()).isAfter(startOfWeek) && 
        dayjs(p.soldAt.toDate()).isBefore(endOfWeek)
    );

    let salesBonus = 0;
    const salesByCategory = userSoldProductsThisWeek.reduce((acc, product) => {
        acc[product.category] = (acc[product.category] || 0) + 1;
        return acc;
    }, {});

    const userGoals = salesGoals.filter(goal => goal.assignedTo === user.id);

    for (const category in salesByCategory) {
        const quantitySold = salesByCategory[category];
        const applicableGoals = userGoals
            .filter(goal => goal.category === category && quantitySold >= goal.quantityMin && quantitySold <= goal.quantityMax)
            .sort((a, b) => b.bonus - a.bonus);

        if (applicableGoals.length > 0) {
            salesBonus += applicableGoals[0].bonus;
        }
    }

    const finalSalary = (user.salarioFixo || 0) + overtimeValue + punctualityBonus + salesBonus - (latenessDeductions + absenceDeductions);

    return {
        workDaysInMonth, presentDays, absenceDays, latenessCount,
        salarioBase: user.salarioFixo || 0,
        punctualityBonus, salesBonus, overtimeValue,
        latenessDeductions, absenceDeductions, finalSalary
    };
}