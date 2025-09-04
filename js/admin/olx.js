// js/admin/olx.js (Módulo Específico para a Seção OLX - CORRIGIDO)

import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let db;
let getGlobalData;

/**
 * Inicializa o módulo de administração da OLX.
 * Esta função é chamada pelo admin.js principal.
 * @param {object} firestoreInstance - A instância do Firestore.
 * @param {function} globalDataGetter - Função para obter os dados globais (usuários, anúncios, etc.).
 */
export function initOlxAdmin(firestoreInstance, globalDataGetter) {
    db = firestoreInstance;
    getGlobalData = globalDataGetter;

    console.log("Módulo de Admin da OLX inicializado.");
    
    // Configura os listeners dos botões e campos da seção
    setupEventListeners();
    
    // Carrega as configurações salvas do Firestore na interface
    displaySettings();
    
    // Adiciona um listener para o evento 'dataUpdated' disparado pelo admin.js
    // Isso garante que o select de usuários seja atualizado se a lista de usuários mudar.
    window.addEventListener('dataUpdated', (e) => {
        if (e.detail.dataType === 'users') {
            populateUserSelect();
        }
    });
}

/**
 * Configura os listeners de eventos para os elementos da UI da seção OLX.
 */
function setupEventListeners() {
    document.getElementById('saveOlxSettings')?.addEventListener('click', handleSaveSettings);
    document.getElementById('generateOlxReport')?.addEventListener('click', handleGenerateReport);

    // Define a data padrão do campo de data do relatório como "hoje"
    const reportDateInput = document.getElementById('olxReportDateRange');
    if (reportDateInput) {
        reportDateInput.value = new Date().toISOString().split('T')[0];
    }
}

/**
 * Popula o <select> de vendedores no formulário de relatórios com base nos dados globais.
 */
function populateUserSelect() {
    const userSelect = document.getElementById('olxReportUser');
    if (!userSelect) return;

    const { users } = getGlobalData();
    const previouslySelectedValue = userSelect.value;
    
    userSelect.innerHTML = '<option value="todos">Todos os Vendedores</option>'; // Limpa e adiciona a opção padrão

    // Adiciona apenas usuários que não são administradores à lista
    users
        .filter(user => user.role !== 'admin')
        .forEach(user => {
            const option = document.createElement('option');
            option.value = user.id; // O ID do documento é o valor da opção
            option.textContent = user.nomeFantasia;
            userSelect.appendChild(option);
        });
    
    // Mantém o valor que estava selecionado anteriormente, se ainda existir
    userSelect.value = previouslySelectedValue;
}

/**
 * Busca e exibe as configurações da OLX salvas no Firestore nos campos do formulário.
 */
async function displaySettings() {
    try {
        const settingsRef = doc(db, "olx-settings", "global");
        const settingsDoc = await getDoc(settingsRef);
        
        if (settingsDoc.exists()) {
            const settings = settingsDoc.data();
            const metaAnunciosEl = document.getElementById('olxMetaAnuncios');
            const apiTokenEl = document.getElementById('olxApiToken');

            if (metaAnunciosEl) metaAnunciosEl.value = settings.metaAnunciosDiaria || 10;
            if (apiTokenEl) apiTokenEl.value = settings.apiToken || '';
        }
    } catch (error) {
        console.error("Erro ao carregar configurações da OLX:", error);
    }
}

/**
 * Salva as configurações (meta e token) no Firestore.
 */
async function handleSaveSettings() {
    const metaAnuncios = parseInt(document.getElementById('olxMetaAnuncios').value, 10) || 10;
    const apiToken = document.getElementById('olxApiToken').value.trim();
    const saveBtn = document.getElementById('saveOlxSettings');
    
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    try {
        const settingsRef = doc(db, "olx-settings", "global");
        await setDoc(settingsRef, { 
            metaAnunciosDiaria: metaAnuncios,
            apiToken: apiToken 
        }, { merge: true });

        saveBtn.textContent = 'Salvo!';
        setTimeout(() => {
            saveBtn.textContent = 'Salvar Configurações da OLX';
            saveBtn.disabled = false;
        }, 2000);

    } catch (error) {
        console.error("Erro ao salvar configurações:", error);
        alert("Ocorreu um erro ao salvar as configurações.");
        saveBtn.textContent = 'Salvar Configurações da OLX';
        saveBtn.disabled = false;
    }
}

/**
 * Coleta os dados, filtra e gera o relatório em uma nova aba.
 */
function handleGenerateReport() {
    const selectedUserId = document.getElementById('olxReportUser').value;
    const dateValue = document.getElementById('olxReportDateRange').value;

    if (!dateValue) {
        alert("Por favor, selecione uma data para o relatório.");
        return;
    }

    const { users, olxAds } = getGlobalData();

    // Define o período do relatório para o dia inteiro selecionado
    const reportDate = new Date(dateValue + 'T03:00:00Z'); // Ajuste de fuso horário
    const startDate = new Date(reportDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(reportDate);
    endDate.setHours(23, 59, 59, 999);

    // Filtra os anúncios para o período selecionado
    let adsToReport = olxAds.filter(ad => {
        const adDate = new Date(ad.data);
        return adDate >= startDate && adDate <= endDate;
    });

    let reportTitle = `Relatório de Performance OLX - ${startDate.toLocaleDateString('pt-BR')}`;
    
    // Se um vendedor específico foi selecionado, filtra os anúncios por ele
    if (selectedUserId && selectedUserId !== 'todos') {
        const user = users.find(u => u.id === selectedUserId);
        if (user) {
            adsToReport = adsToReport.filter(ad => ad.operador === user.nomeFantasia);
            reportTitle = `Relatório de Performance - ${user.nomeFantasia} - ${startDate.toLocaleDateString('pt-BR')}`;
        }
    }

    // Gera o HTML do relatório e o abre em uma nova janela
    const reportHTML = generateReportHTML(adsToReport, startDate, reportTitle);
    const reportWindow = window.open('', '_blank');
    if (reportWindow) {
        reportWindow.document.write(reportHTML);
        reportWindow.document.close();
    } else {
        alert("Não foi possível abrir a janela de relatório. Verifique se o seu navegador está bloqueando pop-ups.");
    }
}

/**
 * Gera a string HTML completa para a página de relatório.
 * @param {Array} records - A lista de anúncios filtrados.
 * @param {Date} reportDate - A data do relatório.
 * @param {string} reportTitle - O título a ser exibido no relatório.
 * @returns {string} O HTML da página de relatório.
 */
function generateReportHTML(records, reportDate, reportTitle) {
    const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const totalAnuncios = records.length;
    const totalValor = records.reduce((sum, ad) => sum + (ad.valor || 0), 0);

    // Agrupa os anúncios por vendedor para criar o resumo
    const operatorSummary = records.reduce((acc, ad) => {
        const op = ad.operador || "Não identificado";
        if (!acc[op]) acc[op] = { count: 0, totalValue: 0 };
        acc[op].count++;
        acc[op].totalValue += (ad.valor || 0);
        return acc;
    }, {});

    // Cria as linhas da tabela de resumo por vendedor
    const operatorRows = Object.entries(operatorSummary)
        .sort(([, a], [, b]) => b.count - a.count)
        .map(([op, data]) => `
            <tr class="bg-gray-800 border-b border-gray-700">
                <td class="px-6 py-4">${op}</td>
                <td class="px-6 py-4 text-center">${data.count}</td>
                <td class="px-6 py-4">${BRL.format(data.totalValue)}</td>
            </tr>
        `).join('');

    // Cria as linhas da tabela com todos os registros
    const recordRows = records.sort((a, b) => new Date(b.data) - new Date(a.data)).map(ad => `
        <tr class="bg-gray-800 border-b border-gray-700">
            <td class="px-6 py-4">${new Date(ad.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
            <td class="px-6 py-4">${ad.titulo}</td>
            <td class="px-6 py-4">${ad.operador || 'N/A'}</td>
            <td class="px-6 py-4">${BRL.format(ad.valor || 0)}</td>
        </tr>
    `).join('');

    // Retorna o template HTML completo
    return `
        <!DOCTYPE html><html lang="pt-BR" class="dark"><head><meta charset="UTF-8"><title>Relatório OLX</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style> body { font-family: 'Inter', sans-serif; } </style>
        </head><body class="bg-gray-900 text-white p-4 sm:p-8">
            <div class="max-w-6xl mx-auto bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl">
                <header class="text-center mb-8">
                    <h2 class="text-2xl sm:text-3xl font-bold">${reportTitle}</h2>
                    <p class="text-gray-400 mt-1">Data: ${reportDate.toLocaleDateString('pt-BR')}</p>
                </header>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 text-center">
                    <div class="bg-gray-700 p-4 rounded-lg"><p class="text-sm text-gray-400">Total de Anúncios</p><p class="text-2xl sm:text-3xl font-bold">${totalAnuncios}</p></div>
                    <div class="bg-gray-700 p-4 rounded-lg"><p class="text-sm text-gray-400">Valor Total Anunciado</p><p class="text-2xl sm:text-3xl font-bold">${BRL.format(totalValor)}</p></div>
                </div>
                <div class="mb-8"><h3 class="text-xl font-semibold mb-4">Resumo por Vendedor</h3><div class="relative overflow-x-auto shadow-md sm:rounded-lg"><table class="w-full text-sm text-left text-gray-400"><thead class="text-xs uppercase bg-gray-700 text-gray-400"><tr><th class="px-6 py-3">Vendedor</th><th class="px-6 py-3 text-center">Anúncios</th><th class="px-6 py-3">Valor Total</th></tr></thead><tbody>${operatorRows}</tbody></table></div></div>
                <div><h3 class="text-xl font-semibold mb-4">Todos os Registros do Dia</h3><div class="relative overflow-x-auto shadow-md sm:rounded-lg max-h-96"><table class="w-full text-sm text-left text-gray-400"><thead class="text-xs uppercase bg-gray-700 text-gray-400 sticky top-0"><tr><th class="px-6 py-3">Hora</th><th class="px-6 py-3">Título</th><th class="px-6 py-3">Vendedor</th><th class="px-6 py-3">Valor</th></tr></thead><tbody>${recordRows}</tbody></table></div></div>
            </div>
        </body></html>
    `;
}