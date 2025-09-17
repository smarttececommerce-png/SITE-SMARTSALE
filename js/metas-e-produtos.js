import { db, auth } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, query, where, serverTimestamp, writeBatch, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let currentUser = null;

// Função utilitária para formatar números como moeda BRL
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function initMetasEProdutos() {
    onAuthStateChanged(auth, user => {
        if (user) {
            currentUser = user;
            loadUserData();
            setupEventListeners();
            listenToProducts();
        } else {
            window.location.href = 'index.html';
        }
    });
}

async function loadUserData() {
    const userDocRef = doc(db, "users", currentUser.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
        document.getElementById('header-user-name').textContent = `Bem-vindo, ${userDocSnap.data().nomeFantasia}!`;
    }
    const metasDocRef = doc(db, "userMetas", currentUser.uid);
    onSnapshot(metasDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const metas = docSnap.data();
            document.getElementById('meta-mensal').value = metas.metaMensal || 'R$ 0,00';
            document.getElementById('meta-diaria').value = metas.metaDiaria || 'R$ 0,00';
            document.getElementById('comissao').value = metas.comissao || '0%';
        }
    });
}

function setupEventListeners() {
    document.querySelectorAll('.kpi-input').forEach(input => {
        input.addEventListener('focus', e => e.target.nextElementSibling.classList.remove('hidden'));
        input.addEventListener('blur', e => {
            setTimeout(() => { if (!document.activeElement.classList.contains('save-btn')) e.target.nextElementSibling.classList.add('hidden'); }, 200);
        });
    });
    document.querySelectorAll('.save-btn').forEach(button => button.addEventListener('click', handleSaveMeta));
    document.getElementById('add-product-btn').addEventListener('click', () => document.getElementById('add-product-modal').classList.remove('hidden'));
    document.getElementById('product-modal-close-btn').addEventListener('click', () => document.getElementById('add-product-modal').classList.add('hidden'));
    document.getElementById('product-modal-save-btn').addEventListener('click', handleAddNewProduct);
    document.getElementById('tab-available').addEventListener('click', () => switchProductTab('available'));
    document.getElementById('tab-sold').addEventListener('click', () => switchProductTab('sold'));
}

async function handleSaveMeta(e) {
    const targetInputId = e.target.dataset.target;
    const input = document.getElementById(targetInputId);
    const value = input.value;
    const metasDocRef = doc(db, "userMetas", currentUser.uid);
    const docKey = targetInputId.replace(/-(\w)/g, (_, c) => c.toUpperCase());
    try {
        await setDoc(metasDocRef, { [docKey]: value }, { merge: true });
        e.target.classList.add('hidden');
        input.blur();
    } catch (error) { console.error("Erro ao salvar meta: ", error); }
}

// ==========================================================================
// LÓGICA DE PRODUTOS
// ==========================================================================

function switchProductTab(tabName) {
    const availableContent = document.getElementById('available-products-content');
    const soldContent = document.getElementById('sold-products-content');
    const availableTab = document.getElementById('tab-available');
    const soldTab = document.getElementById('tab-sold');

    if (tabName === 'available') {
        availableContent.classList.remove('hidden');
        soldContent.classList.add('hidden');
        availableTab.classList.add('active');
        soldTab.classList.remove('active');
    } else {
        availableContent.classList.add('hidden');
        soldContent.classList.remove('hidden');
        availableTab.classList.remove('active');
        soldTab.classList.add('active');
    }
}

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
                ${!showSellButton ? `<p class="text-xs text-green-400">Vendido em: ${product.soldAt ? dayjs(product.soldAt.toDate()).format('DD/MM/YYYY') : ''}</p>` : ''}
            </div>
            ${showSellButton ? `<button data-id="${product.id}" class="sold-btn">Vendido</button>` : ''}
        </div>
    `).join('');

    if (showSellButton) {
        container.querySelectorAll('.sold-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const productId = e.target.dataset.id;
                const productData = products.find(p => p.id === productId);
                handleMarkAsSold(productData);
            });
        });
    }
}

async function handleAddNewProduct() {
    const name = document.getElementById('product-name-input').value.trim();
    const category = document.getElementById('product-category-input').value;
    const price = parseFloat(document.getElementById('product-price-input').value);
    const cost = parseFloat(document.getElementById('product-cost-input').value);

    if (!name || !category || isNaN(price) || isNaN(cost) || price <= 0 || cost < 0) {
        return alert("Preencha todos os campos com valores válidos.");
    }

    try {
        await addDoc(collection(db, "products"), { 
            name, 
            category, 
            price, 
            cost, 
            status: 'available', 
            userId: currentUser.uid, 
            createdAt: serverTimestamp() 
        });
        document.getElementById('add-product-modal').classList.add('hidden');
        document.getElementById('product-name-input').value = '';
        document.getElementById('product-price-input').value = '';
        document.getElementById('product-cost-input').value = '';
    } catch (error) { 
        console.error("Erro ao adicionar produto:", error); 
        alert("Ocorreu um erro ao adicionar o produto.");
    }
}


async function handleMarkAsSold(productData) {
    const productRef = doc(db, "products", productData.id);
    const metasRef = doc(db, "userMetas", currentUser.uid);
    try {
        const metasSnap = await getDoc(metasRef);
        const dayjs = window.dayjs;
        const today = dayjs().format('YYYY-MM-DD');

        const currentVendido = metasSnap.exists() && metasSnap.data().lastSaleDate === today ? (metasSnap.data().totalVendidoHoje || 0) : 0;
        const currentLucro = metasSnap.exists() && metasSnap.data().lastSaleDate === today ? (metasSnap.data().lucroHoje || 0) : 0;
        
        const newVendido = currentVendido + productData.price;
        const newLucro = currentLucro + (productData.price - productData.cost);

        const batch = writeBatch(db);
        batch.update(productRef, { status: "sold", soldAt: serverTimestamp() });
        batch.set(metasRef, { 
            totalVendidoHoje: newVendido, 
            lucroHoje: newLucro,
            lastSaleDate: today
        }, { merge: true });
        await batch.commit();

    } catch (error) { console.error("Erro ao marcar como vendido:", error); }
}

initMetasEProdutos();