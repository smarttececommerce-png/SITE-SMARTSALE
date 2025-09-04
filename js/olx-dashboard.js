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