// js/admin/smartsale.js (Módulo de Administração do Smart Sale)

let db;
let getGlobalData;

/**
 * Inicializa o módulo de administração do Smart Sale.
 * Esta função é exportada e chamada pelo admin.js principal.
 * @param {object} firestoreInstance - A instância do Firestore.
 * @param {function} globalDataGetter - Função para obter os dados globais.
 */
export function initSmartsaleAdmin(firestoreInstance, globalDataGetter) {
    db = firestoreInstance;
    getGlobalData = globalDataGetter;

    console.log("Módulo de Admin do Smart Sale inicializado.");
    
    // Exibe as tarefas pendentes assim que o módulo é carregado
    displayAllPendingTasks();

    // Adiciona um listener para o evento 'dataUpdated' disparado pelo admin.js.
    // Isso garante que a lista de tarefas seja atualizada automaticamente.
    window.addEventListener('dataUpdated', (e) => {
        if (e.detail.dataType === 'tasks' || e.detail.dataType === 'users') {
            displayAllPendingTasks();
        }
    });
}

/**
 * Busca os dados globais de tarefas e usuários, filtra as tarefas pendentes
 * e as exibe na interface do painel de administração.
 */
function displayAllPendingTasks() {
    const { tasks, users } = getGlobalData();
    const taskListContainer = document.getElementById('allTasksList');

    // Se o container HTML não for encontrado, interrompe a função para evitar erros.
    if (!taskListContainer) {
        console.error("Elemento 'allTasksList' não foi encontrado no DOM.");
        return;
    }

    const pendingTasks = tasks.filter(task => task.status !== 'concluido');

    if (pendingTasks.length === 0) {
        taskListContainer.innerHTML = '<p class="text-gray-400 italic">Nenhuma tarefa pendente no momento.</p>';
        return;
    }

    // Cria um mapa de IDs de usuário para nomes, para facilitar a busca do nome do responsável.
    const userMap = new Map(users.map(user => [user.id, user.nomeFantasia]));

    // Define a ordem de prioridade para ordenação
    const priorityOrder = { 'alta': 1, 'media': 2, 'baixa': 3 };
    pendingTasks.sort((a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3));

    // Gera o HTML para cada cartão de tarefa e o insere no container.
    taskListContainer.innerHTML = pendingTasks.map(task => {
        const assignedUserName = userMap.get(task.assignedTo) || 'Usuário desconhecido';
        
        // Define a cor da borda com base na prioridade da tarefa
        const priorityClass = {
            alta: 'border-red-500',
            media: 'border-yellow-500',
            baixa: 'border-green-500'
        }[task.priority] || 'border-gray-500';

        return `
            <div class="bg-gray-700 p-4 rounded-lg shadow-md border-l-4 ${priorityClass}">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-semibold text-white">${task.title}</p>
                        <p class="text-sm text-gray-300 mt-1">${task.description || 'Sem descrição.'}</p>
                    </div>
                    <span class="text-xs font-medium capitalize px-2 py-1 rounded-full bg-gray-600 text-gray-200">${task.priority}</span>
                </div>
                <div class="mt-3 pt-2 border-t border-gray-600 text-right text-xs text-gray-400">
                    Atribuído a: <strong>${assignedUserName}</strong>
                </div>
            </div>
        `;
    }).join('');
}