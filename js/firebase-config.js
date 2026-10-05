// ============================================================
//  ADIVINHE A COR — configuração do Firebase
// ------------------------------------------------------------
//  Cole aqui o config do seu projeto Firebase
//  (Console do Firebase > Configurações do projeto > Seus apps > Web).
//
//  Enquanto o apiKey estiver com "COLE_AQUI", o jogo roda em
//  MODO TESTE LOCAL: funciona em várias abas do MESMO navegador,
//  sem internet, só pra testar.
// ============================================================
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBgUo1HzmcX92YbPCexUoieuFd_DIYo1eQ",
  authDomain: "adivinhar-cor.firebaseapp.com",
  // Se o seu Realtime Database mostrar outro endereço no topo da página, troque aqui:
  databaseURL: "https://adivinhar-cor-default-rtdb.firebaseio.com",
  projectId: "adivinhar-cor",
  storageBucket: "adivinhar-cor.firebasestorage.app",
  messagingSenderId: "16398975465",
  appId: "1:16398975465:web:75e882918e64d382680b78"
};

// Pasta (nó) do Realtime Database onde o jogo guarda tudo.
window.DB_ROOT = "adivinheacor";
