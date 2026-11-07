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
| **Cidade** | O bairro São Francisco (São Luís/MA) **em escala real** — veja [Mapa](#mapa) |
| **Eventos** | Vazamento, vizinho barulhento, mãe ligando, convite do Marcos, elogio do chefe, cobrança da senhoria... |
| **Ciclo dia/noite** | Iluminação com tone mapping, sombras, sombras de nuvens passando, brilho (bloom) à noite, janelas acesas e poças de luz dos postes |
| **Ambientação** | Água animada com espuma na orla e faixa de areia, coqueiros na Av. Ferreira Gullar, praças com flores, casas coloridas com muro, portão e caixa d'água, carros circulando pelas ruas reais e faixas de pedestre |
| **Som** | Som ambiente sintetizado no navegador (mar perto da orla, vento, trânsito, pássaros de dia, grilos à noite) e efeitos na interface. Liga e desliga em 🔊 |

## Mapa

O mundo é o bairro **São Francisco, São Luís/MA**, em **escala real: 1 unidade = 1 metro**.

- Área: **1.941 m × 1.978 m** (o mesmo recorte do mapa de referência, alinhado em Web Mercator: zoom 15,75 ≈ 2,83 m por pixel).
- Ruas, avenidas, ponte, linha da costa, praças e prédios vêm do **OpenStreetMap**: 327 vias, cerca de 63 km de ruas com largura e calçada por tipo de via e nomes reais escritos no asfalto.
- Cerca de 4.600 casas foram distribuídas em lotes ao longo das ruas, voltadas para a calçada, e há cerca de 7.700 árvores e 1.600 postes.
- **Locais do jogo** (posicionados pelos marcadores do mapa de referência): casa alugada, Escritório, Fábrica de Salgados, casa da Júlia, casa da Dona Lúcia, Supermercado, Academia, Bar do Zé e a Praça Pôr do Sol.
- Andar custa tempo real de jogo (~75 m por minuto). Na tela, trajetos longos são acelerados. Use **M** (ou 🗺️ Mapa) para ver o bairro inteiro de cima.

O mapa é gerado por `tools/build_map.py` (Python com shapely, OpenCV e Pillow) a partir de um export do OSM e do alinhamento com a imagem de referência. O resultado fica em `js/mapdata.js`.

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
js/nav.js           A* na grade de 1 m (janela + caminho suavizado)
js/ui.js            HUD, menus, lojas
js/data.js          constantes e dados
js/mapdata.js       mapa do bairro (gerado)
tools/build_map.py  gerador do mapa
vendor/             three.js (+ addons de pós-processamento)
js/fx.js            efeitos: água, nuvens, texturas, areia/espuma
js/traffic.js       carros nas ruas
js/audio.js         som ambiente sintetizado
```

## Ideias para o futuro

- Interior visível de todos os prédios (hoje o personagem "entra" e some)
- Mais empregos e carreiras, estudos, habilidades e hobbies
- Mais NPCs com vida própria e amizades/rivalidades
- Casamento, mudança de casa, pets, doenças, clima e estações
- Sons e música

## Licença

Código: MIT — veja [LICENSE](LICENSE). Three.js © seus autores, licença MIT.
Dados do mapa: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licença ODbL.
