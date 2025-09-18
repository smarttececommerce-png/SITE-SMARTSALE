// js/metas-e-produtos.js (REVISADO - Correção final na permissão de admin para cancelar vendas)

import { db, auth } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, updateDoc, query, where, serverTimestamp, writeBatch, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

dayjs.extend(window.dayjs_plugin_isoWeek);

let currentUser = null;
let currentEditingProductId = null;

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

onAuthStateChanged(auth, user => {
    if (user) {
        currentUser = user;
        initializePage();
    } else {
        window.location.href = 'index.html';
    }
});

function initializePage() {
    loadUserDataAndMetas();
    setupEventListeners();
    listenToProducts();
    listenToWeeklyProgress();
}

async function loadUserDataAndMetas() {
    const userDocRef = doc(db, "users", currentUser.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
        document.getElementById('header-user-name').textContent = `Bem-vindo, ${userDocSnap.data().nomeFantasia}!`;
    }
    const metasDocRef = doc(db, "userMetas", currentUser.uid);
    onSnapshot(metasDocRef, (docSnap) => {
        const metas = docSnap.exists() ? docSnap.data() : {};
        const today = window.dayjs().format('YYYY-MM-DD');

        const totalVendidoHoje = (metas.lastSaleDate === today) ? metas.totalVendidoHoje : 0;
        const lucroHoje = (metas.lastSaleDate === today) ? metas.lucroHoje : 0;

        document.getElementById('total-vendido-hoje').textContent = formatCurrency(totalVendidoHoje);
        document.getElementById('lucro-hoje').textContent = formatCurrency(lucroHoje);
    });
}

function setupEventListeners() {
    document.getElementById('add-product-btn').addEventListener('click', () => showModal('add-product-modal'));
    document.getElementById('product-modal-close-btn').addEventListener('click', () => hideModal('add-product-modal'));
    document.getElementById('product-modal-save-btn').addEventListener('click', handleAddNewProduct);
    document.getElementById('product-category-input').addEventListener('change', () => toggleBatteryHealthField('add'));
    document.getElementById('edit-product-modal-close-btn').addEventListener('click', () => hideModal('edit-product-modal'));
    document.getElementById('edit-product-modal-save-btn').addEventListener('click', handleUpdateProduct);
    document.getElementById('edit-product-category-input').addEventListener('change', () => toggleBatteryHealthField('edit'));
    document.getElementById('tab-available').addEventListener('click', () => switchProductTab('available'));
    document.getElementById('tab-sold').addEventListener('click', () => switchProductTab('sold'));
}

function toggleBatteryHealthField(modalType) {
    const categoryInput = document.getElementById(`${modalType}-product-category-input`);
    const batteryField = document.getElementById(`${modalType}-battery-health-field`);
    const batteryInput = document.getElementById(`${modalType}-product-battery-health-input`);

    if (!categoryInput || !batteryField || !batteryInput) return;

    if (categoryInput.value === 'Apple') {
        batteryField.classList.remove('hidden');
    } else {
        batteryField.classList.add('hidden');
        batteryInput.value = '';
    }
}

async function listenToProducts() {
    const usersSnapshot = await getDocs(collection(db, "users"));
    const userMap = new Map(usersSnapshot.docs.map(doc => [doc.id, doc.data().nomeFantasia]));
    const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    
    onSnapshot(q, snapshot => {
        const allProducts = snapshot.docs.map(doc => {
            const product = { id: doc.id, ...doc.data() };
            product.userName = userMap.get(product.userId) || 'Desconhecido';
            if (product.soldBy) {
                product.soldByUserName = userMap.get(product.soldBy) || 'Desconhecido';
            }
            return product;
        });
        
        const availableProducts = allProducts.filter(p => p.status === 'available');
        const soldProducts = allProducts.filter(p => p.status === 'sold');
        
        renderProductList(availableProducts, 'product-list-container', { showEdit: true, showSell: true });
        renderProductList(soldProducts, 'sold-product-list-container', { showCancel: true });
    });
}

function renderProductList(products, containerId, actions) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (products.length === 0) {
        container.innerHTML = `<p class="text-gray-500 italic col-span-full text-center">Nenhum produto encontrado.</p>`;
        return;
    }

    container.innerHTML = products.map(product => {
        const batteryInfo = (product.category === 'Apple' && product.batteryHealth) ? `<span class="text-xs text-cyan-400 ml-2">(Bateria: ${product.batteryHealth}%)</span>` : '';
        
        let actionButtons = '<div class="flex items-center gap-2">';
        if (actions.showEdit) {
            actionButtons += `<button data-id="${product.id}" class="action-btn edit-btn"><i class="fas fa-pencil-alt"></i></button>`;
        }
        if (actions.showSell) {
            actionButtons += `<button data-id="${product.id}" class="sold-btn">Vendido</button>`;
        }
        if (actions.showCancel) {
            actionButtons += `<button data-id="${product.id}" class="action-btn cancel-sale-btn">Cancelar Venda</button>`;
        }
        actionButtons += '</div>';

        const soldByInfo = actions.showCancel && product.soldByUserName ? `<p class="text-xs text-gray-400">Vendido por: ${product.soldByUserName}</p>` : '';
        const createdByInfo = `<p class="text-xs text-gray-500 mt-1">Criado por: ${product.userName}</p>`;

        return `
        <div class="product-item">
            <div class="product-info">
                <p class="name">${product.name} ${batteryInfo}</p>
                <p class="price">${formatCurrency(product.price)} <span class="text-xs text-gray-400">(${product.category || 'Sem categoria'})</span></p>
                ${actions.showCancel ? `<p class="text-xs text-green-400">Vendido em: ${product.soldAt ? window.dayjs(product.soldAt.toDate()).format('DD/MM/YYYY') : 'N/A'}</p>` : ''}
                ${soldByInfo}
                ${createdByInfo}
            </div>
            ${actionButtons}
        </div>
    `}).join('');

    if (actions.showSell) {
        container.querySelectorAll('.sold-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const buttonEl = e.currentTarget;
                const productId = buttonEl.dataset.id;
                const productData = products.find(p => p.id === productId);
                handleMarkAsSold(productData, buttonEl);
            });
        });
    }
    if (actions.showEdit) {
        container.querySelectorAll('.edit-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const productId = e.currentTarget.dataset.id;
                const productData = products.find(p => p.id === productId);
                openEditModal(productData);
            });
        });
    }
    if (actions.showCancel) {
        container.querySelectorAll('.cancel-sale-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const buttonEl = e.currentTarget;
                const productId = buttonEl.dataset.id;
                const productData = products.find(p => p.id === productId);
                handleCancelSale(productData, buttonEl);
            });
        });
    }
}

function listenToWeeklyProgress() {
    const goalsQuery = query(collection(db, "salesGoals"), where("assignedTo", "==", currentUser.uid));

    onSnapshot(goalsQuery, (goalsSnapshot) => {
        const userGoals = goalsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const startOfWeek = window.dayjs().startOf('isoWeek').toDate();
        const endOfWeek = window.dayjs().endOf('isoWeek').toDate();

        const productsQuery = query(
            collection(db, "products"),
            where("status", "==", "sold"),
            where("soldBy", "==", currentUser.uid),
            where("soldAt", ">=", startOfWeek),
            where("soldAt", "<=", endOfWeek)
        );

        onSnapshot(productsQuery, (productsSnapshot) => {
            const soldThisWeek = productsSnapshot.docs.map(doc => doc.data());
            updateWeeklyProgressUI(userGoals, soldThisWeek);
        }, (error) => {
            console.error("Erro ao buscar produtos da semana (pode ser necessário criar um índice no Firestore):", error);
            const container = document.getElementById('weekly-goals-container');
            if (container) container.innerHTML = `<p class="text-red-500">Erro ao carregar metas. Verifique o console para mais detalhes.</p>`;
        });
    });
}

function updateWeeklyProgressUI(goals, soldProducts) {
    const container = document.getElementById('weekly-goals-container');
    if (!container) return;

    if (goals.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic">Nenhuma meta semanal definida para você.</p>';
        return;
    }

    const salesByCategory = soldProducts.reduce((acc, product) => {
        acc[product.category] = (acc[product.category] || 0) + 1;
        return acc;
    }, {});

    const goalsByCategory = goals.reduce((acc, goal) => {
        if (!acc[goal.category]) acc[goal.category] = [];
        acc[goal.category].push(goal);
        acc[goal.category].sort((a, b) => a.quantityMin - b.quantityMin);
        return acc;
    }, {});

    let html = '';
    for (const category in goalsByCategory) {
        const categoryGoals = goalsByCategory[category];
        const quantitySold = salesByCategory[category] || 0;
        let currentGoal = null;
        let nextGoal = null;

        for (const goal of categoryGoals) {
            if (quantitySold >= goal.quantityMin && quantitySold <= goal.quantityMax) {
                currentGoal = goal;
            }
            if (quantitySold < goal.quantityMin && !nextGoal) {
                nextGoal = goal;
            }
        }

        html += `
            <div class="kpi-card">
                <h3 class="kpi-title">${category}</h3>
                <div class="flex justify-between items-center">
                    <p class="text-2xl font-bold">${quantitySold} vendidos</p>
                    ${currentGoal ? `<span class="text-lg font-bold text-green-400">+ ${formatCurrency(currentGoal.bonus)}</span>` : ''}
                </div>
                ${nextGoal ? `<p class="text-sm text-gray-400 mt-2">Próxima meta: Vender ${nextGoal.quantityMin} para ganhar ${formatCurrency(nextGoal.bonus)}</p>`
                          : currentGoal ? `<p class="text-sm text-green-400 mt-2">Meta atual concluída!</p>`
                          : `<p class="text-sm text-gray-400 mt-2">Você ultrapassou todas as metas!</p>`
                }
            </div>
        `;
    }
    container.innerHTML = html || '<p class="text-gray-500 italic">Acompanhe aqui o progresso das suas metas semanais.</p>';
}

async function handleAddNewProduct() {
    const form = document.getElementById('add-product-modal');
    const name = form.querySelector('#product-name-input').value.trim();
    const category = form.querySelector('#product-category-input').value;
    const price = parseFloat(form.querySelector('#product-price-input').value);
    const cost = parseFloat(form.querySelector('#product-cost-input').value);
    const batteryHealth = parseInt(form.querySelector('#product-battery-health-input').value, 10);
    const saveButton = form.querySelector('#product-modal-save-btn');

    if (!name || !category || isNaN(price) || isNaN(cost) || price <= 0 || cost < 0) {
        alert("Preencha todos os campos com valores válidos.");
        return;
    }
    
    const productData = { name, category, price, cost, status: 'available', userId: currentUser.uid, createdAt: serverTimestamp() };
    if (category === 'Apple' && !isNaN(batteryHealth)) productData.batteryHealth = batteryHealth;

    saveButton.disabled = true;
    saveButton.textContent = "A guardar...";
    try {
        await addDoc(collection(db, "products"), productData);
        hideModal('add-product-modal');
        form.querySelectorAll('input, select').forEach(el => el.value = '');
        toggleBatteryHealthField('add');
    } catch (error) { 
        console.error("Erro ao adicionar produto:", error); 
        alert("Ocorreu um erro ao adicionar o produto.");
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Guardar Produto";
    }
}

function openEditModal(productData) {
    currentEditingProductId = productData.id;
    const modal = document.getElementById('edit-product-modal');
    modal.querySelector('#edit-product-id').value = productData.id;
    modal.querySelector('#edit-product-name-input').value = productData.name;
    modal.querySelector('#edit-product-category-input').value = productData.category;
    modal.querySelector('#edit-product-price-input').value = productData.price;
    modal.querySelector('#edit-product-cost-input').value = productData.cost;
    const batteryInput = modal.querySelector('#edit-product-battery-health-input');
    batteryInput.value = (productData.category === 'Apple' && productData.batteryHealth) ? productData.batteryHealth : '';
    showModal('edit-product-modal');
}

async function handleUpdateProduct() {
    if (!currentEditingProductId) return;
    const form = document.getElementById('edit-product-modal');
    const name = form.querySelector('#edit-product-name-input').value.trim();
    const category = form.querySelector('#edit-product-category-input').value;
    const price = parseFloat(form.querySelector('#edit-product-price-input').value);
    const cost = parseFloat(form.querySelector('#edit-product-cost-input').value);
    const batteryHealth = parseInt(form.querySelector('#edit-product-battery-health-input').value, 10);
    const saveButton = form.querySelector('#edit-product-modal-save-btn');

    if (!name || !category || isNaN(price) || isNaN(cost) || price <= 0 || cost < 0) {
        alert("Preencha todos os campos com valores válidos.");
        return;
    }

    const updatedData = { name, category, price, cost, batteryHealth: (category === 'Apple' && !isNaN(batteryHealth)) ? batteryHealth : null };
    saveButton.disabled = true;
    saveButton.textContent = "A guardar...";
    try {
        const productRef = doc(db, "products", currentEditingProductId);
        await updateDoc(productRef, updatedData);
        hideModal('edit-product-modal');
        currentEditingProductId = null;
    } catch (error) {
        console.error("Erro ao atualizar produto:", error);
        alert("Ocorreu um erro ao atualizar o produto.");
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Salvar Alterações";
    }
}

async function handleMarkAsSold(productData, button) {
    button.disabled = true;
    button.textContent = "A processar...";
    const productRef = doc(db, "products", productData.id);
    const metasRef = doc(db, "userMetas", currentUser.uid);
    try {
        const metasSnap = await getDoc(metasRef);
        const today = window.dayjs().format('YYYY-MM-DD');
        const currentVendido = (metasSnap.exists() && metasSnap.data().lastSaleDate === today) ? (metasSnap.data().totalVendidoHoje || 0) : 0;
        const currentLucro = (metasSnap.exists() && metasSnap.data().lastSaleDate === today) ? (metasSnap.data().lucroHoje || 0) : 0;
        const newVendido = currentVendido + productData.price;
        const newLucro = currentLucro + (productData.price - productData.cost);
        const batch = writeBatch(db);
        batch.update(productRef, { 
            status: "sold", 
            soldAt: serverTimestamp(),
            soldBy: currentUser.uid
        });
        batch.set(metasRef, { totalVendidoHoje: newVendido, lucroHoje: newLucro, lastSaleDate: today }, { merge: true });
        await batch.commit();
    } catch (error) {
        console.error("Erro ao marcar como vendido:", error);
        alert("Não foi possível registar a venda. Tente novamente.");
        button.disabled = false;
        button.textContent = "Vendido";
    }
}

async function handleCancelSale(productData, button) {
    if (!confirm("Tem a certeza de que deseja cancelar esta venda? A ação irá reverter o lucro e o valor das metas do dia.")) {
        return;
    }
    
    // Adiciona uma verificação robusta para o formato da data de venda
    if (!productData.soldAt || typeof productData.soldAt.toDate !== 'function') {
        alert("Não é possível cancelar esta venda. O registo de data da venda é inválido ou antigo. Contacte o suporte.");
        console.error("Invalid soldAt field for product:", productData);
        return;
    }
    
    button.disabled = true;
    button.textContent = "A verificar...";

    const userDocRef = doc(db, "users", currentUser.uid);
    const userDocSnap = await getDoc(userDocRef);
    const userProfile = userDocSnap.exists() ? userDocSnap.data() : null;

    const isAdmin = userProfile && userProfile.role === 'admin';
    const isSeller = currentUser.uid === productData.soldBy;

    if (!isAdmin && !isSeller) {
        alert("Apenas o vendedor que realizou a venda ou um administrador pode cancelar.");
        button.disabled = false;
        button.textContent = "Cancelar Venda";
        return;
    }

    button.textContent = "A cancelar...";
    
    const sellerId = productData.soldBy;
    if (!sellerId) {
        alert("Não foi possível identificar quem realizou a venda para reverter os valores.");
        button.disabled = false;
        button.textContent = "Cancelar Venda";
        return;
    }

    const productRef = doc(db, "products", productData.id);
    const metasRef = doc(db, "userMetas", sellerId);
    
    try {
        const metasSnap = await getDoc(metasRef);
        const saleDate = window.dayjs(productData.soldAt.toDate()).format('YYYY-MM-DD');
        
        const currentVendido = (metasSnap.exists() && metasSnap.data().lastSaleDate === saleDate) ? (metasSnap.data().totalVendidoHoje || 0) : 0;
        const currentLucro = (metasSnap.exists() && metasSnap.data().lastSaleDate === saleDate) ? (metasSnap.data().lucroHoje || 0) : 0;
        
        const newVendido = currentVendido - productData.price;
        const newLucro = currentLucro - (productData.price - productData.cost);

        const batch = writeBatch(db);
        batch.update(productRef, { status: "available", soldAt: null, soldBy: null });
        batch.set(metasRef, { 
            totalVendidoHoje: newVendido < 0 ? 0 : newVendido, 
            lucroHoje: newLucro < 0 ? 0 : newLucro, 
            lastSaleDate: saleDate 
        }, { merge: true });
        
        await batch.commit();
    } catch (error) {
        console.error("Erro ao cancelar venda:", error);
        alert("Não foi possível cancelar a venda. Tente novamente.");
        button.disabled = false;
        button.textContent = "Cancelar Venda";
    }
}


function showModal(modalId) { 
    document.getElementById(modalId).classList.remove('hidden');
    toggleBatteryHealthField(modalId.startsWith('add') ? 'add' : 'edit');
}
function hideModal(modalId) { 
    document.getElementById(modalId).classList.add('hidden'); 
}
function switchProductTab(tabName) {
    document.getElementById('available-products-content').classList.toggle('hidden', tabName !== 'available');
    document.getElementById('sold-products-content').classList.toggle('hidden', tabName !== 'sold');
    document.getElementById('tab-available').classList.toggle('active', tabName === 'available');
    document.getElementById('tab-sold').classList.toggle('active', tabName === 'sold');
}