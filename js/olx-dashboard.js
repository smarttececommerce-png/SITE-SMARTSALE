// js/olx-dashboard.js

// Usando a configuração centralizada do seu projeto
import { firebaseConfig } from './config.js';

// --- INICIALIZAÇÃO DO FIREBASE (Sintaxe v9 modular) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, orderBy, query, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- ESTADO GLOBAL DA APLICAÇÃO ---
// Um objeto central para armazenar todos os dados dinâmicos da página
const state = {
    accounts: [],
    ads: [],
    settings: {},
    view: { calYear: null, calMonth: null },
    currentUser: null,
    currentUserProfile: null
};

// --- AUTENTICAÇÃO E INICIALIZAÇÃO ---
// Esta função é o ponto de entrada da página. Ela verifica se o usuário está logado.
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Se o usuário estiver logado, busca o perfil dele no Firestore
        const userProfileDoc = await getDoc(doc(db, "users", user.uid));
        state.currentUser = user;
        state.currentUserProfile = userProfileDoc.exists()
            ? userProfileDoc.data()
            : { email: user.email, nomeFantasia: user.email.split('@')[0] };

        // Atualiza a interface com as informações do usuário
        document.getElementById('user-name-display').textContent = `Olá, ${state.currentUserProfile.nomeFantasia}`;
        document.getElementById('ad-operador').value = state.currentUserProfile.nomeFantasia;
        document.getElementById('user-info').classList.remove('hidden');

        // Inicia o carregamento de todos os dados do dashboard
        await initializeDashboard();
    } else {
        // Se não estiver logado, redireciona para a página de login
        alert("Sessão não encontrada. Redirecionando para o login.");
        window.location.href = 'index.html';
    }
});

// Função principal que carrega os dados das coleções da OLX no Firestore
async function initializeDashboard() {
    console.log("Carregando dados da OLX...");
    try {
        // As coleções agora precisam ter um nome diferente para não colidir com as do admin
        // Sugestão: 'olx-accounts', 'olx-ads', 'olx-settings'
        const accountsPromise = getDocs(collection(db, 'olx-accounts'));
        const adsPromise = getDocs(query(collection(db, 'olx-ads'), orderBy('data', 'desc')));
        const settingsPromise = getDoc(doc(db, 'olx-settings', 'global'));

        const [accountsSnap, adsSnap, settingsDoc] = await Promise.all([accountsPromise, adsSnap, settingsPromise]);

        state.accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.ads = adsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.settings = settingsDoc.exists()
            ? settingsDoc.data()
            : { metaIphone: 15, metaOutros: 30, padraoLimiteIphone: 5, padraoLimiteOutros: 100 };

        console.log("Dados da OLX carregados:", state);

        // Após carregar os dados, configura os botões e renderiza a tela inicial
        setupEventListeners();
        populateInitialSelects();
        precificacaoInitOnce();
        renderDashboard(); // Renderiza a aba inicial (Dashboard)
    } catch (err) {
        console.error("Falha ao carregar dados da OLX:", err);
        alert("Não foi possível conectar ao banco de dados da OLX. Verifique o nome das coleções no Firestore.");
    }
}
// --- UTILITÁRIOS E FUNÇÕES DE LÓGICA ---

// Formata um número para o padrão de moeda brasileiro (R$)
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Converte uma string (ex: "1.234,56") para um número
const toNumberBRL = (str) => {
    if (!str) return 0;
    const clean = String(str).replace(/[^\d,]/g, '').replace(',', '.');
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : n;
};

// Verifica se uma categoria de anúncio é "iPhone"
const isIphoneCategoria = (cat) => {
    if (!cat) return false;
    return cat.toLowerCase().includes('iphone');
};

// Conta quantos anúncios (geral, iPhones, outros) uma conta específica publicou hoje
function getCountsByAccountForToday(accountId) {
    const hojeStart = new Date();
    hojeStart.setHours(0, 0, 0, 0);

    let geral = 0, iph = 0, out = 0;
    for (const ad of state.ads) {
        if (new Date(ad.data) >= hojeStart && ad.contaId === accountId) {
            geral++;
            if (isIphoneCategoria(ad.categoria)) iph++;
            else out++;
        }
    }
    return { geral, iph, out };
}


// --- EVENT LISTENERS E NAVEGAÇÃO ---

// Configura todos os eventos de clique da página uma única vez
function setupEventListeners() {
    // Botão de Logout
    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

    // Navegação por Abas
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Lógica para alternar a aba ativa
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab').forEach(s => s.classList.add('hidden'));
            document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');

            // Renderiza o conteúdo da aba que foi clicada
            switch (btn.dataset.tab) {
                case 'dashboard': renderDashboard(); break;
                case 'contas': renderContas(); break;
                case 'anuncios': renderAds(); break;
            }
        });
    });

    // Aba Contas
    document.getElementById('btn-add-conta').addEventListener('click', handleAddOrUpdateAccount);
    document.getElementById('conta-search').addEventListener('input', renderContas);
    document.getElementById('contas-tbody').addEventListener('click', handleAccountAction);

    // Aba Anúncios
    document.getElementById('btn-add-ad').addEventListener('click', handleAddAd);
    document.getElementById('ads-tbody').addEventListener('click', handleAdAction);
    document.getElementById('ads-tbody').addEventListener('change', handleAdAction); // Para o select de status
    document.getElementById('btn-aplicar-filtros').addEventListener('click', renderAds);
    document.getElementById('btn-limpar-filtros').addEventListener('click', () => {
        ['filtro-texto', 'filtro-conta', 'filtro-status', 'filtro-data-inicio', 'filtro-data-fim'].forEach(id => document.getElementById(id).value = '');
        renderAds();
    });

    // Calendário no Dashboard
    document.getElementById('cal-prev').addEventListener('click', () => shiftMonth(-1));
    document.getElementById('cal-next').addEventListener('click', () => shiftMonth(1));
}

// Popula os menus <select> com as contas ativas
function populateInitialSelects() {
    const adContaSelect = document.getElementById('ad-conta');
    const filtroContaSelect = document.getElementById('filtro-conta');

    // Guarda o valor selecionado para não perdê-lo ao atualizar
    const adContaValue = adContaSelect.value;
    const filtroContaValue = filtroContaSelect.value;

    adContaSelect.innerHTML = '';
    filtroContaSelect.innerHTML = '<option value="">Todas as contas</option>';

    state.accounts.forEach(account => {
        const opt = document.createElement('option');
        opt.value = account.id;
        opt.textContent = account.nome;
        if (account.status === 'ativo') {
            adContaSelect.appendChild(opt.cloneNode(true));
        }
        filtroContaSelect.appendChild(opt);
    });

    // Restaura o valor que estava selecionado
    adContaSelect.value = adContaValue;
    filtroContaSelect.value = filtroContaValue;
}
// --- LÓGICA DA ABA DE CONTAS ---

// Lida com o clique no botão "Adicionar" conta
async function handleAddOrUpdateAccount() {
    const nomeEl = document.getElementById('acc-nome');
    const nome = nomeEl.value.trim();
    if (!nome) return alert('O nome da conta é obrigatório.');

    const accountData = {
        nome: nome,
        status: document.getElementById('acc-status').value,
        limite: parseInt(document.getElementById('acc-limite').value) || 0,
        limiteIphone: parseInt(document.getElementById('acc-limite-iphone').value) || state.settings.padraoLimiteIphone,
        limiteOutros: parseInt(document.getElementById('acc-limite-outros').value) || state.settings.padraoLimiteOutros,
        criadoEm: new Date().toISOString()
    };

    try {
        // Adiciona a nova conta à coleção 'olx-accounts'
        const docRef = await addDoc(collection(db, "olx-accounts"), accountData);
        // Atualiza o estado local para a interface refletir a mudança imediatamente
        state.accounts.push({ id: docRef.id, ...accountData });

        renderContas(); // Redesenha a tabela de contas
        populateInitialSelects(); // Atualiza os menus <select>

        // Limpa os campos do formulário
        ['acc-nome', 'acc-limite', 'acc-limite-iphone', 'acc-limite-outros'].forEach(id => document.getElementById(id).value = '');
    } catch (error) {
        console.error("Erro ao salvar conta:", error);
        alert("Não foi possível salvar a conta.");
    }
}

// Lida com cliques nos botões "Editar" ou "Excluir" de uma conta na tabela
async function handleAccountAction(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const { act, id } = button.dataset;
    const acc = state.accounts.find(a => a.id === id);
    if (!acc) return;

    if (act === 'del') {
        if (confirm(`Tem certeza que deseja excluir a conta "${acc.nome}"?`)) {
            await deleteDoc(doc(db, "olx-accounts", id));
            state.accounts = state.accounts.filter(a => a.id !== id);
            renderContas(); // Atualiza a UI
        }
    } else if (act === 'edit') {
        const newName = prompt("Novo nome da conta:", acc.nome);
        if (newName && newName.trim() !== '') {
            await updateDoc(doc(db, "olx-accounts", id), { nome: newName.trim() });
            acc.nome = newName.trim();
            renderContas(); // Atualiza a UI
        }
    }
}


// --- LÓGICA DA ABA DE ANÚNCIOS ---

// Lida com o clique no botão "Registrar Anúncio"
async function handleAddAd() {
    const adData = {
        titulo: document.getElementById('ad-titulo').value.trim(),
        categoria: document.getElementById('ad-categoria').value.trim(),
        valor: toNumberBRL(document.getElementById('ad-valor').value),
        contaId: document.getElementById('ad-conta').value,
        operador: state.currentUserProfile.nomeFantasia,
        data: new Date().toISOString(),
        status: document.getElementById('ad-status').value
    };

    if (!adData.titulo || !adData.contaId || adData.valor <= 0) {
        return alert('Preencha Título, Conta e um Valor válido para registrar o anúncio.');
    }

    try {
        const docRef = await addDoc(collection(db, "olx-ads"), adData);
        // Adiciona o novo anúncio no início do array para aparecer primeiro na lista
        state.ads.unshift({ id: docRef.id, ...adData });

        renderAds(); // Atualiza a tabela de anúncios
        renderDashboard(); // Atualiza os KPIs do dashboard

        // Limpa os campos do formulário de anúncio
        ['ad-titulo', 'ad-categoria', 'ad-valor'].forEach(id => document.getElementById(id).value = '');
    } catch (error) {
        console.error("Erro ao registrar anúncio:", error);
        alert("Não foi possível registrar o anúncio.");
    }
}

// Lida com ações na tabela de anúncios (Excluir ou Mudar Status)
async function handleAdAction(e) {
    const element = e.target;
    const id = element.closest('tr')?.dataset.id; // Pega o ID da linha da tabela
    if (!id) return;

    const ad = state.ads.find(a => a.id === id);
    if (!ad) return;

    const action = element.dataset.act;

    if (action === 'del') {
        if (confirm(`Tem certeza que deseja excluir o anúncio "${ad.titulo}"?`)) {
            await deleteDoc(doc(db, "olx-ads", id));
            state.ads = state.ads.filter(a => a.id !== id);
            renderAds();
        }
    } else if (action === 'chgstatus') {
        ad.status = element.value;
        await updateDoc(doc(db, "olx-ads", id), { status: ad.status });
        renderAds(); // Redesenha a tabela para mostrar o novo status
    }
}
// --- FUNÇÕES DE RENDERIZAÇÃO DA INTERFACE ---

// Variáveis globais para os gráficos, para que possam ser destruídos e recriados
let chartContaToday, chartTrend;

// Renderiza a aba principal do Dashboard com KPIs e gráficos
function renderDashboard() {
    const hojeStart = new Date();
    hojeStart.setHours(0, 0, 0, 0);
    const adsHoje = state.ads.filter(a => new Date(a.data) >= hojeStart);

    // KPIs principais
    document.getElementById('kpi-total-hoje').textContent = adsHoje.length;
    document.getElementById('kpi-contas-ativas').textContent = state.accounts.filter(a => a.status === 'ativo').length;

    // Metas
    const iphHoje = adsHoje.filter(a => isIphoneCategoria(a.categoria)).length;
    const metaI = state.settings.metaIphone || 1; // Evita divisão por zero
    const pctI = Math.min(100, (iphHoje / metaI) * 100);
    document.getElementById('prog-iphone').style.width = pctI + '%';
    document.getElementById('meta-iphone-txt').textContent = `${iphHoje}/${metaI}`;

    // ... (Lógica similar pode ser adicionada para a meta "Outros")

    // Gráfico de distribuição por conta
    const countsHoje = getCountsByAccountForToday(null); // Pega a contagem geral
    const ctx1 = document.getElementById('chartPorConta').getContext('2d');
    if (chartContaToday) chartContaToday.destroy();
    chartContaToday = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: state.accounts.map(a => a.nome),
            datasets: [{
                label: 'Anúncios Hoje',
                data: state.accounts.map(a => getCountsByAccountForToday(a.id).geral),
                backgroundColor: '#38bdf8'
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });

    // Gráfico de tendência dos últimos 30 dias
    const days = Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d;
    }).reverse();

    const byDay = days.map(d => {
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        const end = new Date(d);
        end.setHours(23, 59, 59, 999);
        return state.ads.filter(a => {
            const adDate = new Date(a.data);
            return adDate >= start && adDate <= end;
        }).length;
    });

    const ctx2 = document.getElementById('chartTendencia').getContext('2d');
    if (chartTrend) chartTrend.destroy();
    chartTrend = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: days.map(d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })),
            datasets: [{
                label: 'Anúncios',
                data: byDay,
                borderColor: '#22c55e',
                backgroundColor: '#22c55e22',
                tension: 0.3,
                fill: true
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });

    renderCalendar();
}

// Renderiza a tabela da aba de Contas
function renderContas() {
    const tbody = document.getElementById('contas-tbody');
    const searchTerm = document.getElementById('conta-search').value.toLowerCase();
    tbody.innerHTML = '';

    state.accounts.filter(acc => acc.nome.toLowerCase().includes(searchTerm)).forEach(acc => {
        const counts = getCountsByAccountForToday(acc.id);
        const tr = document.createElement('tr');
        tr.dataset.id = acc.id; // Adiciona ID na linha
        tr.innerHTML = `
            <td>${acc.nome}</td>
            <td><span class="pill ${acc.status === 'ativo' ? 'success' : 'warn'}">${acc.status}</span></td>
            <td>${acc.limite || '-'}</td>
            <td>${acc.limiteIphone || '-'}</td>
            <td>${acc.limiteOutros || '-'}</td>
            <td>${counts.geral} / ${counts.iph} / ${counts.out}</td>
            <td>-</td>
            <td>
                <button data-act="edit" data-id="${acc.id}" class="btn-secondary">Editar</button>
                <button data-act="del" data-id="${acc.id}" class="btn-danger">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Renderiza a tabela da aba de Anúncios
function renderAds() {
    const tbody = document.getElementById('ads-tbody');
    const contasById = Object.fromEntries(state.accounts.map(a => [a.id, a.nome]));
    tbody.innerHTML = '';

    // Lógica de filtro (simplificada, pode ser expandida)
    const filteredAds = state.ads.filter(ad => {
        // ... (adicionar lógica completa de filtros aqui)
        return true;
    });

    filteredAds.slice(0, 50).forEach(ad => { // Mostra apenas os 50 mais recentes para performance
        const tr = document.createElement('tr');
        tr.dataset.id = ad.id; // Adiciona ID na linha
        tr.innerHTML = `
            <td>${ad.titulo}</td>
            <td>${ad.categoria}</td>
            <td>${BRL.format(ad.valor)}</td>
            <td>${contasById[ad.contaId] || 'N/A'}</td>
            <td>${ad.operador}</td>
            <td>${new Date(ad.data).toLocaleString('pt-BR')}</td>
            <td><span class="status-chip status-${ad.status}">${ad.status}</span></td>
            <td>
                <select data-act="chgstatus" data-id="${ad.id}">
                    <option value="publicado" ${ad.status === 'publicado' ? 'selected' : ''}>Publicado</option>
                    <option value="pendente" ${ad.status === 'pendente' ? 'selected' : ''}>Pendente</option>
                    <option value="rejeitado" ${ad.status === 'rejeitado' ? 'selected' : ''}>Rejeitado</option>
                </select>
                <button data-act="del" data-id="${ad.id}" class="btn-danger">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- LÓGICA DO CALENDÁRIO ---

function renderCalendar() {
    if (state.view.calYear === null) {
        const now = new Date();
        state.view.calYear = now.getFullYear();
        state.view.calMonth = now.getMonth();
        const wd = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        document.getElementById('cal-weekdays').innerHTML = wd.map(d => `<div>${d}</div>`).join('');
    }

    const y = state.view.calYear, m = state.view.calMonth;
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    document.getElementById('cal-title').textContent = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const grid = document.getElementById('calendar');
    grid.innerHTML = '';

    // Preenche os dias vazios no início do mês
    for (let i = 0; i < first.getDay(); i++) {
        grid.appendChild(document.createElement('div'));
    }

    // Preenche os dias do mês
    for (let d = 1; d <= last.getDate(); d++) {
        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        const date = new Date(y, m, d);

        const start = new Date(date); start.setHours(0, 0, 0, 0);
        const end = new Date(date); end.setHours(23, 59, 59, 999);

        const count = state.ads.filter(a => {
            const adDate = new Date(a.data);
            return adDate >= start && adDate <= end;
        }).length;

        cell.innerHTML = `<div class="cal-day">${d}</div><div class="cal-count">${count}</div>`;

        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (date.getTime() === today.getTime()) cell.classList.add('cal-today');

        grid.appendChild(cell);
    }
}

function shiftMonth(delta) {
    let m = state.view.calMonth + delta;
    let y = state.view.calYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    state.view.calMonth = m;
    state.view.calYear = y;
    renderCalendar();
}

// --- LÓGICA DA CALCULADORA DE PRECIFICAÇÃO ---
function precificacaoInitOnce() {
    const ids = ['pc-sel-categoria', 'pc-inp-custo', 'pc-inp-conc-media', 'pc-sel-estrategia', 'pc-inp-intensidade'];
    ids.forEach(id => document.getElementById(id)?.addEventListener('input', pcUpdate));

    document.getElementById('pc-btn-reset')?.addEventListener('click', () => {
        ['pc-inp-nome', 'pc-inp-custo', 'pc-inp-conc-media', 'pc-inp-conc-min', 'pc-inp-conc-max'].forEach(id => document.getElementById(id).value = '');
        pcUpdate();
    });

    document.getElementById('pc-btn-copiar')?.addEventListener('click', () => {
        const nome = document.getElementById('pc-inp-nome').value;
        const preco = pcCalc().precoSugerido;
        if (!nome || !preco) return alert("Preencha o nome e o custo na calculadora primeiro.");

        document.getElementById('ad-titulo').value = `${nome} - ${BRL.format(preco)}`;
        document.getElementById('ad-valor').value = preco.toFixed(2).replace('.', ',');
    });

    // Popula categorias da calculadora (exemplo)
    const catSelect = document.getElementById('pc-sel-categoria');
    ['iPhone', 'Samsung', 'Xiaomi', 'Outros'].forEach(cat => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = cat;
        catSelect.appendChild(opt);
    });

    pcUpdate(); // Calcula na inicialização
}

function pcCalc() {
    const custo = toNumberBRL(document.getElementById('pc-inp-custo').value);
    const concMed = toNumberBRL(document.getElementById('pc-inp-conc-media').value);
    const estrategia = document.getElementById('pc-sel-estrategia').value;
    const intensidade = parseInt(document.getElementById('pc-inp-intensidade').value || '5', 10) / 100;

    // Lógica de cálculo simplificada
    const margemMin = 0.20; // 20%
    const precoMinSaudavel = custo * (1 + margemMin);

    let precoSugerido = precoMinSaudavel;
    if (concMed > 0) {
        let alvo = concMed;
        if (estrategia === 'abaixo') alvo *= (1 - intensidade);
        if (estrategia === 'acima') alvo *= (1 + intensidade);
        precoSugerido = Math.max(precoMinSaudavel, alvo);
    }

    return { precoSugerido, precoMinSaudavel };
}

function pcUpdate() {
    const { precoSugerido, precoMinSaudavel } = pcCalc();
    document.getElementById('pc-kpi-preco').textContent = BRL.format(precoSugerido);
    document.getElementById('pc-min-saudavel').textContent = BRL.format(precoMinSaudavel);
    // ... (atualizar outros campos da calculadora)
}

