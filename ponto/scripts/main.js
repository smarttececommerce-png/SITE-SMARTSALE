// ponto/scripts/main.js
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { auth, db } from '../../js/config.js';

// Função para verificar se o usuário está logado e obter seus dados.
export function checkAuth(callback) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                const finalUserData = { ...userData, uid: user.uid };
                callback(finalUserData);
            } else {
                console.error("Dados do usuário não encontrados no Firestore. Deslogando.");
                logout();
            }
        } else {
            window.location.href = '../index.html';
        }
    });
}

// Função de Logout
export function logout() {
    signOut(auth).then(() => {
        window.location.href = '../index.html';
    }).catch((error) => {
        console.error("Erro ao fazer logout:", error);
    });
}

// Lógica de troca de tema (AJUSTADA PARA PADRÃO ESCURO)
export function setupThemeToggle() {
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (!themeToggleBtn) return;

    const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
    const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');

    // CORREÇÃO: Define o estado inicial. Se o tema for 'light', mostra o ícone escuro.
    // Em todos os outros casos (tema 'dark' ou não definido), mostra o ícone claro.
    if (localStorage.getItem('color-theme') === 'light') {
        themeToggleDarkIcon.classList.remove('hidden');
    } else {
        document.documentElement.classList.add('dark'); // Garante que a classe dark seja aplicada
        themeToggleLightIcon.classList.remove('hidden');
    }

    themeToggleBtn.addEventListener('click', function () {
        // alterna os ícones
        themeToggleDarkIcon.classList.toggle('hidden');
        themeToggleLightIcon.classList.toggle('hidden');

        // se o tema já foi definido antes
        if (localStorage.getItem('color-theme')) {
            if (localStorage.getItem('color-theme') === 'light') {
                document.documentElement.classList.add('dark');
                localStorage.setItem('color-theme', 'dark');
            } else {
                document.documentElement.classList.remove('dark');
                localStorage.setItem('color-theme', 'light');
            }
        // se o tema NÃO foi definido antes
        } else {
            // Inicia trocando para o modo claro, já que o padrão é escuro
            if (document.documentElement.classList.contains('dark')) {
                document.documentElement.classList.remove('dark');
                localStorage.setItem('color-theme', 'light');
            } else {
                document.documentElement.classList.add('dark');
                localStorage.setItem('color-theme', 'dark');
            }
        }
    });
}


// Inicialização do Day.js (para evitar repetição)
export function initializeDayjs() {
    try {
        const plugins = ['customParseFormat', 'utc', 'timezone', 'localeData', 'isSameOrAfter', 'isSameOrBefore'];
        plugins.forEach(p => {
            if (window[`dayjs_plugin_${p}`]) {
                dayjs.extend(window[`dayjs_plugin_${p}`]);
            }
        });
        dayjs.locale('pt-br');
        dayjs.tz.setDefault("America/Sao_Paulo");
    } catch (error) {
        console.error('Erro na configuração do Day.js:', error);
    }
}