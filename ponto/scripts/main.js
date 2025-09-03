// ponto/scripts/main.js
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { auth, db } from './firebase-config.js';

// Função para verificar se o usuário está logado e obter seus dados.
export function checkAuth(callback) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                callback(userData); // Passa os dados do usuário para a função de callback
            } else {
                // Se não encontrar os dados no Firestore, desloga o usuário
                console.error("Dados do usuário não encontrados no Firestore. Deslogando.");
                logout();
            }
        } else {
            // Se não houver usuário logado, redireciona para a página de login do hub
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

// Lógica de troca de tema
export function setupThemeToggle() {
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (!themeToggleBtn) return;

    const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
    const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');

    // Change the icons inside the button based on previous settings
    if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        themeToggleLightIcon.classList.remove('hidden');
    } else {
        themeToggleDarkIcon.classList.remove('hidden');
    }

    themeToggleBtn.addEventListener('click', function () {
        // toggle icons inside button
        themeToggleDarkIcon.classList.toggle('hidden');
        themeToggleLightIcon.classList.toggle('hidden');

        // if set via local storage previously
        if (localStorage.getItem('color-theme')) {
            if (localStorage.getItem('color-theme') === 'light') {
                document.documentElement.classList.add('dark');
                localStorage.setItem('color-theme', 'dark');
            } else {
                document.documentElement.classList.remove('dark');
                localStorage.setItem('color-theme', 'light');
            }

            // if NOT set via local storage previously
        } else {
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

