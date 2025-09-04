🚀 SITE-SMARTSALE

📝 Descrição Geral
O SITE-SMARTSALE é uma aplicação web robusta, concebida como um hub central de ferramentas de gestão para equipas de vendas e marketing. A plataforma unifica múltiplos painéis para monitorizar e gerir diversos aspetos do negócio, desde a produtividade da equipa e gestão de tarefas até à performance em plataformas de e-commerce e ao controlo de ponto dos funcionários.

Com um sistema de autenticação seguro via Firebase, a aplicação garante que cada utilizador aceda apenas às informações e ferramentas relevantes para a sua função. A interface, construída com Tailwind CSS, é moderna, responsiva e desenhada para proporcionar uma experiência de utilizador limpa e eficiente.

✨ Funcionalidades Principais
A aplicação divide-se num Hub principal para utilizadores e num painel de administração completo para a gestão total do sistema.

HUB de Aplicações (index.html)
O ponto de entrada para todos os utilizadores após o login.

🔐 Autenticação Segura: Sistema de Login e Registo de novas contas.

🧭 Navegação Centralizada: Acesso rápido aos três módulos principais da plataforma:

Smart Sale: Ferramenta para gestão de tarefas e aumento da produtividade da equipa de vendas.

Dashboard OLX: Painel para gestão de anúncios, contas e análise de performance na plataforma OLX.

Ponto Eletrónico: Sistema para registo e gestão de ponto, horas trabalhadas e assiduidade dos funcionários.

👑 Painel de Administração (admin.html)
Uma área restrita para administradores, que oferece controlo total sobre todos os módulos e utilizadores do sistema.

📊 Visão Geral (Dashboard):

Monitorização em tempo real dos funcionários que estão a trabalhar.

Resumo das tarefas do "Smart Sale" (pendentes e concluídas no dia).

⏰ Gestão de Ponto Eletrónico:

Aprovação de justificativas de ausência pendentes.

Configuração de parâmetros como tolerância de atraso e bónus por pontualidade.

Calendário interativo para visualização detalhada dos registos de ponto por funcionário.

Ferramenta para gerar relatórios mensais de frequência e horas.

📈 Gestão do Smart Sale e OLX:

Visualização centralizada de todas as tarefas pendentes.

Definição de metas diárias de anúncios e geração de relatórios de performance.

👥 Gestão de Utilizadores:

Criação de Novos Utilizadores: Registo de novos membros com informações detalhadas (cargo, salário, horários).

Edição e Listagem: Visualização de todos os utilizadores com a possibilidade de editar ou remover o seu acesso.

📂 Estrutura do Projeto
/
|-- index.html            # Tela principal de Login e Hub de aplicações
|-- admin.html            # Painel de Administração
|-- style.css             # Estilos globais
|-- admin.css             # Estilos específicos para o painel admin
|
|-- js/
|   |-- main.js               # Lógica do Hub, autenticação e navegação
|   |-- admin.js              # Lógica principal do painel de administração
|   |-- smartsale-module.js   # Módulo de funcionalidades do Smart Sale
|   |-- config.js             # Configurações do Firebase
|   |-- ... (outros scripts)
|
|-- ponto/
|   |-- dashboard.html        # Dashboard do Ponto Eletrónico para o utilizador
|   |-- ... (outros arquivos do módulo de ponto)
|
|-- README.md             # Este arquivo

🛠️ Tecnologias Utilizadas
🖥️ Frontend:

HTML5

CSS3

JavaScript (ECMAScript 6 Modules)

📚 Frameworks e Bibliotecas:

Tailwind CSS: Para a construção de uma interface moderna e responsiva.

Font Awesome: Para ícones vetoriais.

Day.js: Para manipulação avançada de datas e horas.

Chart.js: Para a criação de gráficos e relatórios visuais.

☁️ Backend e Base de Dados:

Firebase:

Authentication: Para gestão segura de login e registo de utilizadores.

Firestore: Como base de dados NoSQL para armazenar informações de utilizadores, tarefas, registos, etc.

⚙️ Como Configurar o Projeto
Clonar o Repositório:

git clone [https://github.com/seu-usuario/SITE-SMARTSALE.git](https://github.com/seu-usuario/SITE-SMARTSALE.git)

Configurar o Firebase:

Crie um novo projeto na consola do Firebase.

Ative os serviços de Authentication (com o provedor de E-mail/Senha) e Firestore Database.

Na secção de configurações do seu projeto no Firebase, encontre e copie as credenciais de configuração da sua aplicação web.

Cole essas credenciais no ficheiro js/config.js, substituindo o objeto firebaseConfig de exemplo.

Executar a Aplicação:

Como o projeto utiliza módulos JavaScript, é recomendado executá-lo a partir de um servidor local.

Pode usar a extensão "Live Server" no Visual Studio Code ou iniciar um servidor simples com Python:

# Se tiver Python 3.x
python -m http.server

Abra o navegador e aceda ao endereço fornecido (geralmente http://localhost:8000).

Desenvolvido por ZainLet