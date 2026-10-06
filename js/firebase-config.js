// ============================================================
//  ADIVINHE A COR — Firebase único (jogos-github)
//  A trava (/trava.js) já define a configuração; isto é só reserva.
//  Para testar sem internet (modo local), troque o apiKey por "COLE_AQUI".
// ============================================================
window.FIREBASE_CONFIG = window.FIREBASE_CONFIG || {
  apiKey: "AIzaSyBQzl3bmbAEcyNfwqYj69DZHLjFfydlghI",
  authDomain: "jogos-github.firebaseapp.com",
  databaseURL: "https://jogos-github-default-rtdb.firebaseio.com",
  projectId: "jogos-github",
  storageBucket: "jogos-github.firebasestorage.app",
  messagingSenderId: "304376569454",
  appId: "1:304376569454:web:cd724cf50bef036a37907f"
};
// Pasta deste jogo dentro do Firebase único.
window.DB_ROOT = "sites/adivinhe_a_cor";
