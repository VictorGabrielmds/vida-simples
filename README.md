# 🏠 Vida Simples

Um simulador de vida em **3D com câmera ortográfica** (estilo The Sims, porém mais realista nas regras e com gráficos *low-poly* simples). Você controla um personagem comum: mora num apartamento **alugado**, tem **emprego**, uma **namorada**, contas para pagar e uma lista de necessidades e desejos para dar conta.

▶ **Jogue:** https://VictorGabrielmds.github.io/vida-simples/

## Como jogar

- **Clique** em objetos (cama, geladeira, fogão, sofá, PC...), prédios (mercado, academia, bar, escritório...), no parque ou em pessoas para ver as ações disponíveis. Clique no chão para andar.
- **Câmera:** arraste para mover • roda do mouse = zoom • `Q`/`E` giram • `C` recentraliza • `WASD`/setas movem.
- **Tempo:** `Espaço` pausa • `1`–`4` mudam a velocidade. Em ações longas o jogo acelera sozinho (desative em *Auto-acelerar*).
- **Celular** 📱 (botão no topo ou `P`): ligar/mandar mensagem para a Júlia, chamá-la para sair, pedir delivery.
- **🤖 Autonomia:** deixe o personagem viver sozinho e assista.
- O progresso é **salvo automaticamente** no navegador (localStorage).

## O que já existe

| Sistema | Detalhes |
|---|---|
| **Necessidades** | Fome, sede, energia, banheiro, higiene, ambiente (casa limpa), social, diversão, romance e calma + saúde |
| **Emoções** | Derivadas das necessidades + *moodlets* (fatos recentes): feliz, estressado, triste, irritado, ansioso, entediado, solitário, apaixonado, exausto... |
| **Desejos** | Objetivos que aparecem e dão bônus de humor ao serem cumpridos |
| **Casa de aluguel** | Quarto, banheiro e sala/cozinha mobiliados; sujeira visível; compre móveis no PC (videogame, estante, planta, tapete) |
| **Trabalho** | Fábrica de Salgados nos fins de semana (sáb/dom, 8h–16h) como 2º emprego. No Escritório: Seg–Sex, chegar 7h–17h, expediente até 18h; desempenho depende do humor/energia; advertências, faltas, demissão, pedido de aumento, busca de emprego |
| **Dinheiro** | Salário no dia 5 • aluguel dia 10 (multa e despejo se atrasar) • contas de luz/água/internet dia 15 (corte de luz!) |
| **Namorada** | Júlia tem rotina, humor e relação própria: conversar, elogiar, abraçar, beijar, presentear, jantares, passeios, filme em casa. **Mêsversário no dia 20** 💞. Se for negligenciada, ela termina o namoro |
| **Outros NPCs** | Marcos (colega), Dona Lúcia (senhora), Seu Antônio, Camila e Rafa — cada um com horários, necessidades e emoções |
| **Cidade** | Mapa inspirado no bairro São Francisco (São Luís/MA): península com praia, avenida principal, ruas em grade, casa alugada, Escritório, Fábrica de Salgados, casa da Júlia, Mercado, Academia, Bar do Zé e a Praça Pôr do Sol |
| **Eventos** | Vazamento, vizinho barulhento, mãe ligando, convite do Marcos, elogio do chefe, cobrança da senhoria... |
| **Ciclo dia/noite** | Iluminação, sombras, janelas e postes que acendem |

## Rodando localmente

É um site estático (Three.js incluído em `vendor/`, sem build). Qualquer servidor HTTP serve:

```bash
python -m http.server 8080
# abra http://localhost:8080
```

## Estrutura

```
index.html          página e tela inicial
css/style.css       interface
js/main.js          loop, câmera e entrada
js/world.js         cena 3D, cidade, apartamento, luz
js/sim.js           simulação: tempo, necessidades, ações, NPCs, eventos
js/char.js          personagens low-poly, poses, balões de emoção
js/nav.js           A* na grade
js/ui.js            HUD, menus, lojas
js/data.js          constantes e dados
vendor/             three.js
```

## Ideias para o futuro

- Interior visível de todos os prédios (hoje o personagem "entra" e some)
- Mais empregos e carreiras, estudos, habilidades e hobbies
- Mais NPCs com vida própria e amizades/rivalidades
- Casamento, mudança de casa, pets, doenças, clima e estações
- Sons e música

## Licença

MIT — veja [LICENSE](LICENSE). Three.js © seus autores, licença MIT.
