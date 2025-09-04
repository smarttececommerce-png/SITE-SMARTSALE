import { db, auth } from './config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, query, where, serverTimestamp, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let currentUser = null;
let currentEditingCardId = null;

// Função utilitária para formatar números como moeda BRL
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
// Função utilitária para converter string de moeda para número
const parseCurrency = (value) => Number(String(value).replace(/[^0-9,-]+/g, "").replace(",", ".")) || 0;

function initRotinaMetas() {
    onAuthStateChanged(auth, user => {
        if (user) {
            currentUser = user;
            loadUserData();
            setupEventListeners();
            initializeKanbanBoard();
            loadProducts();
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
            document.getElementById('total-vendido').textContent = formatCurrency(metas.totalVendidoHoje || 0);
            document.getElementById('lucro').textContent = formatCurrency(metas.lucroHoje || 0);
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
    document.querySelectorAll('.add-card-btn').forEach(btn => btn.addEventListener('click', showAddCardForm));
    document.querySelectorAll('.cancel-add-btn').forEach(btn => btn.addEventListener('click', hideAddCardForm));
    document.querySelectorAll('.confirm-add-btn').forEach(btn => btn.addEventListener('click', handleAddNewCard));
    document.getElementById('modal-close-btn').addEventListener('click', closeCardModal);
    document.getElementById('modal-save-btn').addEventListener('click', handleUpdateCardDetails);
    document.getElementById('add-product-btn').addEventListener('click', () => document.getElementById('add-product-modal').classList.remove('hidden'));
    document.getElementById('product-modal-close-btn').addEventListener('click', () => document.getElementById('add-product-modal').classList.add('hidden'));
    document.getElementById('product-modal-save-btn').addEventListener('click', handleAddNewProduct);
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

function initializeKanbanBoard() {
    document.querySelectorAll('.cards-container').forEach(column => {
        new Sortable(column, {
            group: 'kanban', animation: 150, ghostClass: 'ghost-card',
            onEnd: async (evt) => {
                const cardRef = doc(db, "kanbanCards", evt.item.dataset.cardId);
                await updateDoc(cardRef, { status: evt.to.dataset.columnListId });
            }
        });
    });
    loadKanbanCards();
}

function loadKanbanCards() {
    const q = query(collection(db, "kanbanCards"), where("userId", "==", currentUser.uid));
    onSnapshot(q, snapshot => {
        document.querySelectorAll('.cards-container').forEach(c => c.innerHTML = '');
        snapshot.docs.forEach(docSnap => {
            const cardData = { id: docSnap.id, ...docSnap.data() };
            const column = document.querySelector(`[data-column-list-id="${cardData.status}"]`);
            if (column) column.appendChild(createCardElement(cardData));
        });
    });
}

function createCardElement(cardData) {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.dataset.cardId = cardData.id;
    card.innerHTML = `<p class="card-title">${cardData.title}</p><button class="delete-card-btn"><i class="fas fa-trash-alt"></i></button>`;
    card.addEventListener('click', e => { if (!e.target.closest('.delete-card-btn')) openCardModal(cardData); });
    card.querySelector('.delete-card-btn').addEventListener('click', () => deleteCard(cardData.id));
    return card;
}

function showAddCardForm(e) {
    const column = e.target.closest('.kanban-column');
    column.querySelector('.add-card-btn').classList.add('hidden');
    column.querySelector('.add-card-form').classList.remove('hidden');
    column.querySelector('.add-card-textarea').focus();
}

function hideAddCardForm(e) {
    const column = e.target.closest('.kanban-column');
    column.querySelector('.add-card-form').classList.add('hidden');
    column.querySelector('.add-card-btn').classList.remove('hidden');
    column.querySelector('.add-card-textarea').value = '';
}

async function handleAddNewCard(e) {
    const column = e.target.closest('.kanban-column');
    const textarea = column.querySelector('.add-card-textarea');
    const title = textarea.value.trim();
    if (!title) return;
    try {
        await addDoc(collection(db, "kanbanCards"), { title, description: "", status: column.dataset.columnId, userId: currentUser.uid, createdAt: serverTimestamp() });
        hideAddCardForm(e);
    } catch (error) { console.error("Erro ao adicionar novo card:", error); }
}

async function deleteCard(cardId) {
    if (confirm("Tem certeza?")) await deleteDoc(doc(db, "kanbanCards", cardId));
}

function openCardModal(cardData) {
    currentEditingCardId = cardData.id;
    document.getElementById('modal-title-input').value = cardData.title;
    document.getElementById('modal-description-textarea').value = cardData.description || "";
    document.getElementById('card-modal').classList.remove('hidden');
}

function closeCardModal() {
    currentEditingCardId = null;
    document.getElementById('card-modal').classList.add('hidden');
}

async function handleUpdateCardDetails() {
    if (!currentEditingCardId) return;
    const newTitle = document.getElementById('modal-title-input').value.trim();
    const newDescription = document.getElementById('modal-description-textarea').value.trim();
    if (!newTitle) return alert("O título não pode ficar vazio.");
    const cardRef = doc(db, "kanbanCards", currentEditingCardId);
    try {
        await updateDoc(cardRef, { title: newTitle, description: newDescription });
        closeCardModal();
    } catch (error) { console.error("Erro ao atualizar o card:", error); }
}

// --- NOVAS FUNÇÕES DE PRODUTOS ---

function loadProducts() {
    const q = query(collection(db, "products"), where("userId", "==", currentUser.uid), where("status", "==", "available"));
    onSnapshot(q, snapshot => {
        const container = document.getElementById('product-list-container');
        container.innerHTML = '';
        snapshot.docs.forEach(docSnap => {
            const productData = { id: docSnap.id, ...docSnap.data() };
            container.appendChild(createProductElement(productData));
        });
    });
}

function createProductElement(productData) {
    const item = document.createElement('div');
    item.className = 'product-item';
    item.innerHTML = `
        <div class="product-info">
            <p class="name">${productData.name}</p>
            <p class="price">${formatCurrency(productData.price)}</p>
        </div>
        <button class="sold-btn">Vendido</button>
    `;
    item.querySelector('.sold-btn').addEventListener('click', () => handleMarkAsSold(productData));
    return item;
}

async function handleAddNewProduct() {
    const name = document.getElementById('product-name-input').value.trim();
    const price = parseFloat(document.getElementById('product-price-input').value);
    const cost = parseFloat(document.getElementById('product-cost-input').value);

    if (!name || isNaN(price) || isNaN(cost) || price <= 0 || cost < 0) {
        return alert("Preencha todos os campos com valores válidos.");
    }
    try {
        await addDoc(collection(db, "products"), { name, price, cost, status: 'available', userId: currentUser.uid, createdAt: serverTimestamp() });
        document.getElementById('add-product-modal').classList.add('hidden');
        document.getElementById('product-name-input').value = '';
        document.getElementById('product-price-input').value = '';
        document.getElementById('product-cost-input').value = '';
    } catch (error) { console.error("Erro ao adicionar produto:", error); }
}

async function handleMarkAsSold(productData) {
    const productRef = doc(db, "products", productData.id);
    const metasRef = doc(db, "userMetas", currentUser.uid);
    try {
        const metasSnap = await getDoc(metasRef);
        const currentVendido = metasSnap.exists() ? metasSnap.data().totalVendidoHoje || 0 : 0;
        const currentLucro = metasSnap.exists() ? metasSnap.data().lucroHoje || 0 : 0;
        
        const newVendido = currentVendido + productData.price;
        const newLucro = currentLucro + (productData.price - productData.cost);

        const batch = writeBatch(db);
        batch.update(productRef, { status: "sold" });
        batch.set(metasRef, { totalVendidoHoje: newVendido, lucroHoje: newLucro }, { merge: true });
        await batch.commit();

    } catch (error) { console.error("Erro ao marcar como vendido:", error); }
}

initRotinaMetas();