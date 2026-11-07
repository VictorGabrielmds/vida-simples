// Dados e constantes do jogo "Vida Simples"
export const MIN_PER_SEC = 2; // minutos de jogo por segundo real (velocidade 1x)
export const MONTHS = ['Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro', 'Janeiro', 'Fevereiro'];
export const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// decay = pontos perdidos por minuto de jogo
export const NEEDS = [
  { id: 'fome', label: 'Fome', icon: '🍽️', decay: 0.115 },
  { id: 'sede', label: 'Sede', icon: '💧', decay: 0.13 },
  { id: 'energia', label: 'Energia', icon: '⚡', decay: 0.07 },
  { id: 'banheiro', label: 'Banheiro', icon: '🚽', decay: 0.17 },
  { id: 'higiene', label: 'Higiene', icon: '🚿', decay: 0.06 },
  { id: 'ambiente', label: 'Ambiente', icon: '🏠', decay: 0.03 },
  { id: 'social', label: 'Social', icon: '💬', decay: 0.05 },
  { id: 'diversao', label: 'Diversão', icon: '🎮', decay: 0.075 },
  { id: 'romance', label: 'Romance', icon: '❤️', decay: 0.02 },
  { id: 'calma', label: 'Calma', icon: '🧘', decay: 0.015 },
];
export const NEED_ICON = Object.fromEntries(NEEDS.map(n => [n.id, n.icon]));
export const NEED_LABEL = Object.fromEntries(NEEDS.map(n => [n.id, n.label]));
const WEIGHT = { fome: 1, sede: 1, energia: 1.2, banheiro: 1, higiene: 0.7, ambiente: 0.5, social: 0.8, diversao: 0.9, romance: 0.8, calma: 1.1 };

export const ITEMS = {
  mantimentos: { label: 'Mantimentos', icon: '🛒', price: 30, desc: 'Dão 3 refeições caseiras' },
  lanche: { label: 'Lanche pronto', icon: '🥪', price: 12, desc: 'Mata a fome rapidinho' },
  agua: { label: 'Água mineral', icon: '🚰', price: 4, desc: 'Mata a sede' },
  refri: { label: 'Refrigerante', icon: '🥤', price: 8, desc: 'Sede + um agrado' },
  chocolate: { label: 'Chocolate', icon: '🍫', price: 18, desc: 'Um mimo (serve de presente)' },
  kit: { label: 'Kit de higiene', icon: '🧼', price: 35, desc: 'Sabonete, papel e pasta (5 usos)' },
  limpeza: { label: 'Produtos de limpeza', icon: '🧴', price: 25, desc: '3 faxinas completas' },
  flores: { label: 'Buquê de flores', icon: '💐', price: 40, desc: 'Presente para a Júlia' },
  marmita: { label: 'Marmita do delivery', icon: '🍱', price: 0, desc: '', noShop: true },
};
export const ITEM_QTY = { mantimentos: 3, kit: 5, limpeza: 3 }; // unidades dadas por compra

export const FURNITURE = {
  console: { label: 'Videogame', icon: '🎮', price: 1800, desc: 'Muita diversão no sofá' },
  estante: { label: 'Estante com livros', icon: '📚', price: 420, desc: 'Permite ler livros' },
  planta: { label: 'Planta de sala', icon: '🪴', price: 60, desc: 'Deixa a casa mais aconchegante' },
  tapete: { label: 'Tapete macio', icon: '🟫', price: 250, desc: 'Conforto extra na sala' },
};

export function emotionOf(n, mood, flags = {}) {
  const g = k => (n[k] === undefined ? 70 : n[k]);
  if (g('energia') < 12) return { id: 'exausto', emoji: '😩', label: 'Exausto' };
  if (g('banheiro') < 8) return { id: 'apertado', emoji: '😬', label: 'Apertado' };
  if (g('fome') < 10 || g('sede') < 10) return { id: 'faminto', emoji: '🤤', label: 'Faminto' };
  if (g('calma') < 25) return { id: 'estressado', emoji: '😤', label: 'Estressado' };
  if (mood < 28) return { id: 'triste', emoji: '😢', label: 'Triste' };
  if (mood < 42 && g('calma') < 50) return { id: 'irritado', emoji: '😠', label: 'Irritado' };
  if (flags.debt) return { id: 'ansioso', emoji: '😰', label: 'Ansioso' };
  if (g('diversao') < 22) return { id: 'entediado', emoji: '😑', label: 'Entediado' };
  if (g('social') < 22) return { id: 'solitario', emoji: '🥺', label: 'Solitário' };
  if (g('romance') > 85 && mood > 65) return { id: 'apaixonado', emoji: '🥰', label: 'Apaixonado' };
  if (mood > 78) return { id: 'feliz', emoji: '😄', label: 'Feliz' };
  if (mood > 60) return { id: 'animado', emoji: '🙂', label: 'Contente' };
  return { id: 'calmo', emoji: '😌', label: 'Tranquilo' };
}

export function moodOf(needs, moodletSum) {
  let sw = 0, s = 0, pen = 0;
  for (const k in WEIGHT) {
    const v = needs[k] === undefined ? 70 : needs[k];
    s += v * WEIGHT[k]; sw += WEIGHT[k];
    if (v < 15) pen += (15 - v) * 0.8;
  }
  return Math.max(0, Math.min(100, s / sw - pen + moodletSum));
}

// Desejos (wants): cumprir gera bônus de humor
export const WANTS = [
  { id: 'tv', text: 'Assistir TV no sofá', trig: 'tv' },
  { id: 'cook', text: 'Cozinhar uma refeição caseira', trig: 'cook' },
  { id: 'call', text: 'Ligar para a Júlia', trig: 'call' },
  { id: 'gym', text: 'Treinar na academia', trig: 'gym' },
  { id: 'gift', text: 'Dar um presente para a Júlia', trig: 'gift' },
  { id: 'beer', text: 'Tomar uma cerveja no bar', trig: 'beer' },
  { id: 'walk', text: 'Passear no parque', trig: 'walk' },
  { id: 'clean', text: 'Deixar a casa brilhando', trig: 'clean' },
  { id: 'read', text: 'Ler um livro', trig: 'read', needs: 'estante' },
  { id: 'game', text: 'Jogar videogame', trig: 'game', needs: 'console' },
  { id: 'date', text: 'Sair com a Júlia', trig: 'date' },
  { id: 'study', text: 'Estudar para crescer na carreira', trig: 'study' },
  { id: 'friend', text: 'Bater um papo com o Marcos', trig: 'marcos' },
  { id: 'shower', text: 'Tomar um banho relaxante', trig: 'shower' },
  { id: 'buy_console', text: 'Comprar um videogame', trig: 'buy_console', notOwned: 'console' },
  { id: 'buy_planta', text: 'Ter uma plantinha em casa', trig: 'buy_planta', notOwned: 'planta' },
];

export const NPC_DEFS = {
  julia: { name: 'Júlia', role: 'Namorada', emoji: '👩', skin: '#f1c7a3', shirt: '#e8618c', pants: '#3b4a7a', hair: '#3a2417', long: true, rel: 72, mood0: 65, humor: 0.5, empathy: 0.8 },
  marcos: { name: 'Marcos', role: 'Colega de trabalho', emoji: '👨', skin: '#c58c64', shirt: '#4c8a5a', pants: '#2f3340', hair: '#1c1c1c', rel: 45, mood0: 60, humor: 0.8, empathy: 0.4 },
  lucia: { name: 'Dona Lúcia', role: 'Senhoria', emoji: '👵', skin: '#e8bf9b', shirt: '#8d5fa8', pants: '#5b5b66', hair: '#d8d8d8', long: false, rel: 50, mood0: 55, humor: 0.3, empathy: 0.6 },
  antonio: { name: 'Seu Antônio', role: 'Vizinho', emoji: '👴', skin: '#d9a57c', shirt: '#c9b458', pants: '#4b4033', hair: '#e5e5e5', rel: 40, mood0: 60, humor: 0.6, empathy: 0.5 },
  camila: { name: 'Camila', role: 'Vizinha corredora', emoji: '🏃‍♀️', skin: '#b87a55', shirt: '#2ea7c9', pants: '#222831', hair: '#14110f', long: true, rel: 35, mood0: 70, humor: 0.6, empathy: 0.6 },
  rafa: { name: 'Rafa', role: 'Skatista do bairro', emoji: '🛹', skin: '#f0c9a4', shirt: '#e0782b', pants: '#2a3a63', hair: '#7a4b1f', rel: 30, mood0: 62, humor: 0.9, empathy: 0.3 },
};

export const fmt = n => 'R$ ' + Math.round(n).toLocaleString('pt-BR');
export const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const hhmm = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0');
