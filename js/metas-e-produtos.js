// js/metas-e-produtos.js (REVISADO - Operações Atómicas e Melhor UX)

import { db, auth } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, updateDoc, query, where, serverTimestamp, writeBatch, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let currentUser = null;

// Função utilitária para formatar números como moeda BRL
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

/**
 * Ponto de entrada: verifica a autenticação e inicializa o módulo.
 */
onAuthStateChanged(auth, user => {
    if (user) {
        currentUser = user;
        initializePage();
    } else {
        window.location.href = 'index.html'; // Redireciona se não estiver logado
    }
});

/**
 * Inicializa todas as funcionalidades da página.
 */
function initializePage() {
    loadUserDataAndMetas();
    setupEventListeners();
    listenToProducts();
}

/**
 * Carrega os dados do utilizador e ouve as atualizações nas suas metas.
 */
async function loadUserDataAndMetas() {
    const userDocRef = doc(db, "users", currentUser.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
        document.getElementById('header-user-name').textContent = `Bem-vindo, ${userDocSnap.data().nomeFantasia}!`;
    }

    const metasDocRef = doc(db, "userMetas", currentUser.uid);
    onSnapshot(metasDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const metas = docSnap.data();
            // Garante que os valores são formatados ou define um padrão
            document.getElementById('meta-mensal').value = metas.metaMensal || 'R$ 0,00';
            document.getElementById('meta-diaria').value = metas.metaDiaria || 'R$ 0,00';
            document.getElementById('comissao').value = metas.comissao || '0%';
        }
    });
}

/**
 * Configura todos os event listeners da página.
 */
function setupEventListeners() {
    // Listeners para guardar metas
    document.querySelectorAll('.save-btn').forEach(button => button.addEventListener('click', handleSaveMeta));

    // Listeners do modal de adicionar produto
    document.getElementById('add-product-btn').addEventListener('click', () => showModal('add-product-modal'));
    document.getElementById('product-modal-close-btn').addEventListener('click', () => hideModal('add-product-modal'));
    document.getElementById('product-modal-save-btn').addEventListener('click', handleAddNewProduct);

    // Listeners para a navegação por abas (Disponíveis/Vendidos)
    document.getElementById('tab-available').addEventListener('click', () => switchProductTab('available'));
    document.getElementById('tab-sold').addEventListener('click', () => switchProductTab('sold'));
}

/**
 * Guarda uma meta individual no Firestore.
 * @param {Event} e O evento de clique.
 */
async function handleSaveMeta(e) {
    const targetInputId = e.target.dataset.target;
    const input = document.getElementById(targetInputId);
    const value = input.value;
    const docKey = targetInputId.replace(/-(\w)/g, (_, c) => c.toUpperCase()); // Converte 'meta-mensal' para 'metaMensal'
    
    e.target.disabled = true;
    e.target.textContent = 'A guardar...';

    try {
        const metasDocRef = doc(db, "userMetas", currentUser.uid);
        await setDoc(metasDocRef, { [docKey]: value }, { merge: true });
        input.blur();
    } catch (error) {
        console.error("Erro ao guardar meta: ", error);
        alert("Não foi possível guardar a meta.");
    } finally {
        e.target.disabled = false;
        e.target.textContent = 'Guardar';
    }
}

// --- LÓGICA DE PRODUTOS ---

/**
 * Ouve as alterações na coleção de produtos do utilizador e re-renderiza as listas.
 */
function listenToProducts() {
    const q = query(
        collection(db, "products"), 
        where("userId", "==", currentUser.uid),
        orderBy("createdAt", "desc")
    );
    
    onSnapshot(q, snapshot => {
        const allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const availableProducts = allProducts.filter(p => p.status === 'available');
        const soldProducts = allProducts.filter(p => p.status === 'sold');
        
        renderProductList(availableProducts, 'product-list-container', true);
        renderProductList(soldProducts, 'sold-product-list-container', false);
    });
}

/**
 * Renderiza uma lista de produtos num contentor específico.
 * @param {Array} products - A lista de produtos a renderizar.
 * @param {string} containerId - O ID do elemento contentor.
 * @param {boolean} showSellButton - Se deve ou não mostrar o botão "Vendido".
 */
function renderProductList(products, containerId, showSellButton) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (products.length === 0) {
        container.innerHTML = `<p class="text-gray-500 italic col-span-full text-center">Nenhum produto encontrado.</p>`;
        return;
    }

    container.innerHTML = products.map(product => `
        <div class="product-item">
            <div class="product-info">
                <p class="name">${product.name} <span class="text-xs text-gray-400">(${product.category || 'Sem categoria'})</span></p>
                <p class="price">${formatCurrency(product.price)}</p>
                ${!showSellButton ? `<p class="text-xs text-green-400">Vendido em: ${product.soldAt ? window.dayjs(product.soldAt.toDate()).format('DD/MM/YYYY') : 'N/A'}</p>` : ''}
            </div>
            ${showSellButton ? `<button data-id="${product.id}" class="sold-btn">Vendido</button>` : ''}
        </div>
    `).join('');

    if (showSellButton) {
        container.querySelectorAll('.sold-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const productId = e.target.dataset.id;
                const productData = products.find(p => p.id === productId);
                handleMarkAsSold(productData, e.target);
            });
        });
    }
}

/**
 * Manipula a adição de um novo produto.
 */
async function handleAddNewProduct() {
    const form = document.getElementById('add-product-modal');
    const name = form.querySelector('#product-name-input').value.trim();
    const category = form.querySelector('#product-category-input').value;
    const price = parseFloat(form.querySelector('#product-price-input').value);
    const cost = parseFloat(form.querySelector('#product-cost-input').value);
    const saveButton = form.querySelector('#product-modal-save-btn');

    if (!name || !category || isNaN(price) || isNaN(cost) || price <= 0 || cost < 0) {
        alert("Preencha todos os campos com valores válidos.");
        return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "A guardar...";

    try {
        await addDoc(collection(db, "products"), { 
            name, category, price, cost, 
            status: 'available', 
            userId: currentUser.uid, 
            createdAt: serverTimestamp() 
        });
        hideModal('add-product-modal');
        // Limpa o formulário após o sucesso
        form.querySelectorAll('input, select').forEach(el => el.value = '');
    } catch (error) { 
        console.error("Erro ao adicionar produto:", error); 
        alert("Ocorreu um erro ao adicionar o produto.");
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Guardar Produto";
    }
}

/**
 * Marca um produto como vendido e atualiza as metas do utilizador numa transação atómica.
 * @param {object} productData - Os dados do produto a ser vendido.
 * @param {HTMLElement} button - O botão que foi clicado.
 */
async function handleMarkAsSold(productData, button) {
    button.disabled = true;
    button.textContent = "A processar...";

    const productRef = doc(db, "products", productData.id);
    const metasRef = doc(db, "userMetas", currentUser.uid);

    try {
        const metasSnap = await getDoc(metasRef);
        const today = window.dayjs().format('YYYY-MM-DD');

        // Se a última venda não foi hoje, reinicia os contadores diários
        const currentVendido = (metasSnap.exists() && metasSnap.data().lastSaleDate === today) ? (metasSnap.data().totalVendidoHoje || 0) : 0;
        const currentLucro = (metasSnap.exists() && metasSnap.data().lastSaleDate === today) ? (metasSnap.data().lucroHoje || 0) : 0;
        
        const newVendido = currentVendido + productData.price;
        const newLucro = currentLucro + (productData.price - productData.cost);

        // CORREÇÃO: Usa um batch para garantir que ambas as escritas são bem-sucedidas
        const batch = writeBatch(db);
        batch.update(productRef, { status: "sold", soldAt: serverTimestamp() });
        batch.set(metasRef, { 
            totalVendidoHoje: newVendido, 
            lucroHoje: newLucro,
            lastSaleDate: today
        }, { merge: true });
        
        await batch.commit();

    } catch (error) {
        console.error("Erro ao marcar como vendido:", error);
        alert("Não foi possível registar a venda. Tente novamente.");
        button.disabled = false; // Reativa o botão em caso de erro
        button.textContent = "Vendido";
    }
    // Não é preciso reativar o botão em caso de sucesso, pois o produto desaparecerá da lista
}

// --- Funções Utilitárias de UI ---

function showModal(modalId) { document.getElementById(modalId).classList.remove('hidden'); }
function hideModal(modalId) { document.getElementById(modalId).classList.add('hidden'); }

function switchProductTab(tabName) {
    document.getElementById('available-products-content').classList.toggle('hidden', tabName !== 'available');
    document.getElementById('sold-products-content').classList.toggle('hidden', tabName !== 'sold');
    document.getElementById('tab-available').classList.toggle('active', tabName === 'available');
    document.getElementById('tab-sold').classList.toggle('active', tabName === 'sold');
}