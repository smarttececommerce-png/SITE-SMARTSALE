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
const state = {
    accounts: [],
    ads: [],
    settings: {},
    view: { calYear: null, calMonth: null },
    currentUser: null,
    currentUserProfile: null
};

// --- AUTENTICAÇÃO E INICIALIZAÇÃO ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userProfileDoc = await getDoc(doc(db, "users", user.uid));
        state.currentUser = user;
        state.currentUserProfile = userProfileDoc.exists() 
            ? userProfileDoc.data() 
            : { email: user.email, nomeFantasia: user.email.split('@')[0] };
        
        document.getElementById('user-name-display').textContent = `Olá, ${state.currentUserProfile.nomeFantasia}`;
        document.getElementById('ad-operador').value = state.currentUserProfile.nomeFantasia;
        document.getElementById('user-info').classList.remove('hidden');
        
        await initializeDashboard();
    } else {
        alert("Sessão não encontrada. Redirecionando para o login.");
        window.location.href = 'index.html';
    }
});

async function initializeDashboard() {
    console.log("Carregando dados da OLX...");
    try {
        const accountsPromise = getDocs(collection(db, 'accounts'));
        const adsPromise = getDocs(query(collection(db, 'ads'), orderBy('data', 'desc')));
        const settingsPromise = getDoc(doc(db, 'settings', 'global'));

        // CORREÇÃO APLICADA AQUI
        const [accountsSnap, adsSnap, settingsDoc] = await Promise.all([accountsPromise, adsPromise, settingsPromise]);
        
        state.accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.ads = adsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.settings = settingsDoc.exists() 
            ? settingsDoc.data() 
            : { metaIphone: 15, metaOutros: 30, padraoLimiteIphone: 5, padraoLimiteOutros: 100 };
        
        console.log("Dados da OLX carregados:", state);
        setupEventListeners();
        populateInitialSelects();
        precificacaoInitOnce();
        renderDashboard();
    } catch (err) {
        console.error("Falha ao carregar dados da OLX:", err);
        alert("Não foi possível conectar ao banco de dados da OLX.");
    }
}

// --- UTILITÁRIOS E FUNÇÕES DE LÓGICA ---
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const toNumberBRL = (str) => {
    if (!str) return 0;
    const clean = String(str).replace(/[^\d,]/g, '').replace(',', '.');
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : n;
};
const isIphoneCategoria = (cat) => cat && cat.toLowerCase().includes('iphone');

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
function setupEventListeners() {
    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab').forEach(s => s.classList.add('hidden'));
            document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
        });
    });

    document.getElementById('btn-add-conta').addEventListener('click', handleAddOrUpdateAccount);
    document.getElementById('conta-search').addEventListener('input', renderContas);
    document.getElementById('contas-tbody').addEventListener('click', handleAccountAction);

    document.getElementById('btn-add-ad').addEventListener('click', handleAddAd);
    document.getElementById('ads-tbody').addEventListener('click', handleAdAction);
    document.getElementById('ads-tbody').addEventListener('change', handleAdAction);
    document.getElementById('btn-aplicar-filtros').addEventListener('click', renderAds);
    document.getElementById('btn-limpar-filtros').addEventListener('click', () => {
        ['filtro-texto', 'filtro-conta', 'filtro-status', 'filtro-data-inicio', 'filtro-data-fim'].forEach(id => document.getElementById(id).value = '');
        renderAds();
    });
    
    document.getElementById('cal-prev').addEventListener('click', () => shiftMonth(-1));
    document.getElementById('cal-next').addEventListener('click', () => shiftMonth(1));
}

function populateInitialSelects() {
    const adContaSelect = document.getElementById('ad-conta');
    const filtroContaSelect = document.getElementById('filtro-conta');
    const adContaValue = adContaSelect.value;
    const filtroContaValue = filtroContaSelect.value;
    
    adContaSelect.innerHTML = '';
    filtroContaSelect.innerHTML = '<option value="">Todas as contas</option>';

    state.accounts.forEach(account => {
        const opt = document.createElement('option');
        opt.value = account.id;
        opt.textContent = account.nome;
        if (account.status === 'ativo') adContaSelect.appendChild(opt.cloneNode(true));
        filtroContaSelect.appendChild(opt);
    });
    
    adContaSelect.value = adContaValue;
    filtroContaSelect.value = filtroContaValue;
}

// --- LÓGICA DA ABA DE CONTAS ---
async function handleAddOrUpdateAccount() {
    const nome = document.getElementById('acc-nome').value.trim();
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
        const docRef = await addDoc(collection(db, "accounts"), accountData);
        state.accounts.push({ id: docRef.id, ...accountData });
        renderContas();
        populateInitialSelects();
        ['acc-nome', 'acc-limite', 'acc-limite-iphone', 'acc-limite-outros'].forEach(id => document.getElementById(id).value = '');
    } catch (error) {
        console.error("Erro ao salvar conta:", error);
        alert("Não foi possível salvar a conta.");
    }
}

async function handleAccountAction(e) {
    const button = e.target.closest('button');
    if (!button) return;
    const { act, id } = button.dataset;
    const acc = state.accounts.find(a => a.id === id);
    if (!acc) return;

    if (act === 'del') {
        if (confirm(`Excluir conta "${acc.nome}"?`)) {
            await deleteDoc(doc(db, "accounts", id));
            state.accounts = state.accounts.filter(a => a.id !== id);
            renderContas();
        }
    } else if (act === 'edit') {
        const newName = prompt("Novo nome da conta:", acc.nome);
        if (newName && newName.trim() !== '') {
            await updateDoc(doc(db, "accounts", id), { nome: newName.trim() });
            acc.nome = newName.trim();
            renderContas();
        }
    }
}

// --- LÓGICA DA ABA DE ANÚNCIOS ---
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
        return alert('Preencha Título, Conta e um Valor válido.');
    }
    
    try {
        const docRef = await addDoc(collection(db, "ads"), adData);
        state.ads.unshift({ id: docRef.id, ...adData });
        renderAds();
        renderDashboard();
        ['ad-titulo', 'ad-categoria', 'ad-valor'].forEach(id => document.getElementById(id).value = '');
    } catch (error) {
        console.error("Erro ao registrar anúncio:", error);
        alert("Não foi possível registrar o anúncio.");
    }
}

async function handleAdAction(e) {
    const element = e.target;
    const row = element.closest('tr');
    if (!row) return;
    const id = row.dataset.id;
    const ad = state.ads.find(a => a.id === id);
    if (!ad) return;

    const action = element.dataset.act;
    if (action === 'del') {
        if (confirm(`Excluir anúncio "${ad.titulo}"?`)) {
            await deleteDoc(doc(db, "ads", id));
            state.ads = state.ads.filter(a => a.id !== id);
            renderAds();
        }
    } else if (element.tagName === 'SELECT') {
        ad.status = element.value;
        await updateDoc(doc(db, "ads", id), { status: ad.status });
        renderAds();
    }
}

// --- FUNÇÕES DE RENDERIZAÇÃO ---
let chartContaToday, chartTrend;

function renderDashboard() {
    const hojeStart = new Date();
    hojeStart.setHours(0, 0, 0, 0);
    const adsHoje = state.ads.filter(a => new Date(a.data) >= hojeStart);
    
    document.getElementById('kpi-total-hoje').textContent = adsHoje.length;
    document.getElementById('kpi-contas-ativas').textContent = state.accounts.filter(a => a.status === 'ativo').length;
    
    const iphHoje = adsHoje.filter(a => isIphoneCategoria(a.categoria)).length;
    const metaI = state.settings.metaIphone || 1;
    const pctI = Math.min(100, (iphHoje / metaI) * 100);
    document.getElementById('prog-iphone').style.width = pctI + '%';
    document.getElementById('meta-iphone-txt').textContent = `${iphHoje}/${metaI}`;

    const countsHoje = {};
    adsHoje.forEach(ad => {
        countsHoje[ad.contaId] = (countsHoje[ad.contaId] || 0) + 1;
    });

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
    
    const days = Array.from({length: 30}, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d;
    }).reverse();

    const byDay = days.map(d => {
        const start = new Date(d); start.setHours(0,0,0,0);
        const end = new Date(d); end.setHours(23,59,59,999);
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
            labels: days.map(d => d.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})),
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

function renderContas() {
    const tbody = document.getElementById('contas-tbody');
    const searchTerm = document.getElementById('conta-search').value.toLowerCase();
    tbody.innerHTML = '';
    
    state.accounts.filter(acc => acc.nome.toLowerCase().includes(searchTerm)).forEach(acc => {
        const counts = getCountsByAccountForToday(acc.id);
        const tr = document.createElement('tr');
        tr.dataset.id = acc.id;
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

function renderAds() {
    const tbody = document.getElementById('ads-tbody');
    const contasById = Object.fromEntries(state.accounts.map(a => [a.id, a.nome]));
    tbody.innerHTML = '';
    
    state.ads.slice(0, 100).forEach(ad => {
        const tr = document.createElement('tr');
        tr.dataset.id = ad.id;
        tr.innerHTML = `
            <td>${ad.titulo}</td>
            <td>${ad.categoria}</td>
            <td>${BRL.format(ad.valor)}</td>
            <td>${contasById[ad.contaId] || 'N/A'}</td>
            <td>${ad.operador}</td>
            <td>${new Date(ad.data).toLocaleString('pt-BR')}</td>
            <td><span class="status-chip status-${ad.status}">${ad.status}</span></td>
            <td>
                <select data-act="chgstatus">
                    <option value="publicado" ${ad.status === 'publicado' ? 'selected' : ''}>Publicado</option>
                    <option value="pendente" ${ad.status === 'pendente' ? 'selected' : ''}>Pendente</option>
                    <option value="rejeitado" ${ad.status === 'rejeitado' ? 'selected' : ''}>Rejeitado</option>
                </select>
                <button data-act="del" class="btn-danger">Excluir</button>
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

    for (let i = 0; i < first.getDay(); i++) {
        grid.appendChild(document.createElement('div'));
    }

    for (let d = 1; d <= last.getDate(); d++) {
        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        const date = new Date(y, m, d);
        const start = new Date(date); start.setHours(0,0,0,0);
        const end = new Date(date); end.setHours(23,59,59,999);
        const count = state.ads.filter(a => {
            const adDate = new Date(a.data);
            return adDate >= start && adDate <= end;
        }).length;
        cell.innerHTML = `<div class="cal-day">${d}</div><div class="cal-count">${count}</div>`;
        const today = new Date(); today.setHours(0,0,0,0);
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
    
    const catSelect = document.getElementById('pc-sel-categoria');
    ['iPhone', 'Samsung', 'Xiaomi', 'Outros'].forEach(cat => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = cat;
        catSelect.appendChild(opt);
    });

    pcUpdate();
}

function pcCalc() {
    const custo = toNumberBRL(document.getElementById('pc-inp-custo').value);
    const concMed = toNumberBRL(document.getElementById('pc-inp-conc-media').value);
    const estrategia = document.getElementById('pc-sel-estrategia').value;
    const intensidade = parseInt(document.getElementById('pc-inp-intensidade').value || '5', 10) / 100;

    const margemMin = 0.20;
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
}