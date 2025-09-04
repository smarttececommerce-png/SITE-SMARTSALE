// js/admin/olx.js (Módulo de Administração da OLX)

import { doc, getDoc, setDoc, getDocs, query, collection, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Chart.js e xlsx.full.min.js precisam estar disponíveis globalmente (incluídos no admin.html)

let db;
let getAllUsers;
let getAllOlxAds;
let getAllOlxAccounts;

// Variáveis para os gráficos, para que possam ser destruídos e recriados
let chartDia, chartConta;

// Função de inicialização chamada pelo admin.js
export function initOlxAdmin(firestore, usersFunc, adsFunc, accountsFunc) {
    db = firestore;
    getAllUsers = usersFunc;
    getAllOlxAds = adsFunc;
    getAllOlxAccounts = accountsFunc;
    
    console.log("Módulo de Admin da OLX inicializado.");
    
    setupOlxEventListeners();
    updateOlxUI();

    // Ouve eventos para atualizar a UI se os dados mudarem
    window.addEventListener('usersUpdated', populateUserSelects);
    window.addEventListener('olxSettingsUpdated', displayOlxSettings);
}

function setupOlxEventListeners() {
    document.getElementById('saveOlxSettings')?.addEventListener('click', handleSaveSettings);
    document.getElementById('generateOlxReport')?.addEventListener('click', handleGenerateReport);
}

function updateOlxUI() {
    populateUserSelects();
    displayOlxSettings();
}

function populateUserSelects() {
    const userSelect = document.getElementById('olxReportUser');
    if (!userSelect) return;
    
    const users = getAllUsers();
    const oldValue = userSelect.value;
    
    while (userSelect.options.length > 1) {
        userSelect.remove(1);
    }

    users.forEach(user => {
        if (user.role !== 'admin') {
            const option = document.createElement('option');
            option.value = user.uid; // Usar UID para filtrar
            option.textContent = user.nomeFantasia;
            userSelect.appendChild(option);
        }
    });
    userSelect.value = oldValue;
}

async function displayOlxSettings() {
    const settingsDoc = await getDoc(doc(db, "olx-settings", "global"));
    if (!settingsDoc.exists()) return;

    const settings = settingsDoc.data();
    const metaAnunciosEl = document.getElementById('olxMetaAnuncios');
    const apiTokenEl = document.getElementById('olxApiToken');

    if (metaAnunciosEl) metaAnunciosEl.value = settings.metaAnunciosDiaria || 10;
    if (apiTokenEl) apiTokenEl.value = settings.apiToken || '';
}

async function handleSaveSettings() {
    const newSettings = {
        metaAnunciosDiaria: parseInt(document.getElementById('olxMetaAnuncios').value) || 10,
        apiToken: document.getElementById('olxApiToken').value.trim()
    };
    
    const saveBtn = document.getElementById('saveOlxSettings');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    try {
        await setDoc(doc(db, "olx-settings", "global"), newSettings, { merge: true });
        
        saveBtn.textContent = 'Salvo!';
        saveBtn.classList.add('bg-green-600');
        setTimeout(() => {
            saveBtn.textContent = 'Salvar Configurações da OLX';
            saveBtn.classList.remove('bg-green-600');
            saveBtn.disabled = false;
        }, 2000);
    } catch (error) {
        console.error("Erro ao salvar configurações da OLX:", error);
        alert("Erro ao salvar configurações.");
        saveBtn.textContent = 'Salvar Configurações da OLX';
        saveBtn.disabled = false;
    }
}

// --- LÓGICA DE RELATÓRIOS ---

async function handleGenerateReport() {
    const selectedUserId = document.getElementById('olxReportUser').value;
    const dateValue = document.getElementById('olxReportDateRange').value;
    
    if (!dateValue) {
        alert("Por favor, selecione uma data final para o relatório (serão analisados os 30 dias anteriores a ela).");
        return;
    }
    
    const endDate = new Date(dateValue + 'T23:59:59');
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 29); // 30 dias no total

    let adsToReport = getAllOlxAds().filter(ad => {
        const adDate = new Date(ad.data);
        return adDate >= startDate && adDate <= endDate;
    });
    
    let reportTitle = "Relatório Geral de Performance OLX";

    if (selectedUserId && selectedUserId !== 'todos') {
        const user = getAllUsers().find(u => u.uid === selectedUserId);
        if (user) {
            adsToReport = adsToReport.filter(ad => ad.operador === user.nomeFantasia);
            reportTitle = `Relatório de Performance - ${user.nomeFantasia}`;
        }
    }

    const reportHTML = generateReportHTML(adsToReport, startDate, endDate, reportTitle);
    const reportWindow = window.open('', '_blank');
    reportWindow.document.write(reportHTML);
    reportWindow.document.close();
}

function generateReportHTML(records, startDate, endDate, reportTitle) {
    const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const totalAnuncios = records.length;
    const totalValor = records.reduce((sum, ad) => sum + (ad.valor || 0), 0);

    const byOperator = {};
    records.forEach(ad => {
        const op = ad.operador || "Não identificado";
        if (!byOperator[op]) byOperator[op] = { count: 0, lastAd: 0 };
        byOperator[op].count++;
        const adDate = new Date(ad.data).getTime();
        if (adDate > byOperator[op].lastAd) byOperator[op].lastAd = adDate;
    });

    const operatorRows = Object.entries(byOperator)
        .sort(([, a], [, b]) => b.count - a.count)
        .map(([op, data]) => `
            <tr class="bg-gray-800 border-b border-gray-700">
                <td class="px-6 py-4">${op}</td>
                <td class="px-6 py-4">${data.count}</td>
                <td class="px-6 py-4">${new Date(data.lastAd).toLocaleString('pt-BR')}</td>
            </tr>
        `).join('');

    const recordRows = records.map(ad => `
        <tr class="bg-gray-800 border-b border-gray-700">
            <td class="px-6 py-4">${new Date(ad.data).toLocaleString('pt-BR')}</td>
            <td class="px-6 py-4">${ad.titulo}</td>
            <td class="px-6 py-4">${ad.operador || 'N/A'}</td>
            <td class="px-6 py-4">${BRL.format(ad.valor || 0)}</td>
        </tr>
    `).join('');

    return `
        <!DOCTYPE html><html lang="pt-BR" class="dark"><head><meta charset="UTF-8"><title>Relatório OLX</title>
        <script src="https://cdn.tailwindcss.com/"></script>
        </head><body class="bg-gray-900 text-white p-8">
            <div class="max-w-6xl mx-auto bg-gray-800 p-8 rounded shadow">
                <div class="text-center mb-8">
                    <h2 class="text-3xl font-bold">${reportTitle}</h2>
                    <p class="text-gray-400">Período: ${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}</p>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 text-center">
                    <div class="bg-gray-700 p-4 rounded-lg">
                        <p class="text-sm text-gray-400">Total de Anúncios</p>
                        <p class="text-3xl font-bold">${totalAnuncios}</p>
                    </div>
                    <div class="bg-gray-700 p-4 rounded-lg">
                        <p class="text-sm text-gray-400">Valor Total Anunciado</p>
                        <p class="text-3xl font-bold">${BRL.format(totalValor)}</p>
                    </div>
                    <div class="bg-gray-700 p-4 rounded-lg">
                        <p class="text-sm text-gray-400">Média de Anúncios/Dia</p>
                        <p class="text-3xl font-bold">${(totalAnuncios / 30).toFixed(1)}</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div>
                        <h3 class="text-xl font-semibold mb-4">Eficiência por Operador</h3>
                        <div class="relative overflow-x-auto shadow-md sm:rounded-lg">
                            <table class="w-full text-sm text-left text-gray-400">
                                <thead class="text-xs uppercase bg-gray-700 text-gray-400">
                                    <tr><th class="px-6 py-3">Operador</th><th class="px-6 py-3">Anúncios</th><th class="px-6 py-3">Última Atividade</th></tr>
                                </thead>
                                <tbody>${operatorRows}</tbody>
                            </table>
                        </div>
                    </div>
                    <div>
                         <h3 class="text-xl font-semibold mb-4">Gráfico (Placeholder)</h3>
                         <div class="bg-gray-700 rounded-lg flex items-center justify-center h-64">
                             <p class="text-gray-500">Gráficos serão implementados aqui</p>
                         </div>
                    </div>
                </div>

                <div class="mt-8">
                    <h3 class="text-xl font-semibold mb-4">Todos os Registros do Período</h3>
                    <div class="relative overflow-x-auto shadow-md sm:rounded-lg max-h-96">
                        <table class="w-full text-sm text-left text-gray-400">
                            <thead class="text-xs uppercase bg-gray-700 text-gray-400 sticky top-0">
                                <tr><th class="px-6 py-3">Data/Hora</th><th class="px-6 py-3">Título</th><th class="px-6 py-3">Operador</th><th class="px-6 py-3">Valor</th></tr>
                            </thead>
                            <tbody>${recordRows}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </body></html>`;
} 