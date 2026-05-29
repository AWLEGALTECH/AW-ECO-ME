# Prompt mestre — Landing page socioeconômica (AW ECO ME)

> Cole o bloco abaixo (tudo dentro de `=== INÍCIO DO PROMPT ===` / `=== FIM DO PROMPT ===`)
> em uma nova sessão para gerar a landing page. Ele é autocontido: traz o
> endpoint, o contrato da API, os 7 campos e o briefing de design.

```
=== INÍCIO DO PROMPT ===

Você vai construir uma LANDING PAGE de coleta de dados socioeconômicos para um
escritório de advocacia (AW ECO ME — Dr. Matheus Enes). A página é enviada por
link a UM cliente específico já cadastrado, coleta 7 respostas simples e grava
direto no banco do escritório. Vai morar em um domínio próprio (ex.: Vercel /
Netlify / GitHub Pages), SEPARADO do sistema interno.

──────────────────────────────────────────────────────────────────────────────
OBJETIVO
──────────────────────────────────────────────────────────────────────────────
Uma página leve, acolhedora e mobile-first onde o cliente:
  1. Abre o link já personalizado pra ele (o ID dele vem na URL).
  2. Vê uma saudação com o primeiro nome ("Olá, Maria!").
  3. Responde 7 perguntas de perfil socioeconômico.
  4. Envia. Os dados são salvos no cadastro DELE no banco.
  5. Vê uma tela de agradecimento.

O cliente é leigo — nada de jargão jurídico, nada de "preencha o formulário".
Tom humano, gentil, tranquilizador ("essas informações ajudam a defender melhor
o seu caso"). Acessível, fontes grandes, alto contraste.

──────────────────────────────────────────────────────────────────────────────
STACK
──────────────────────────────────────────────────────────────────────────────
HTML + CSS + JavaScript puro, em ARQUIVO ÚNICO (index.html), sem build, sem
framework, sem dependências externas além de uma fonte do Google Fonts (Inter).
Motivo: máxima portabilidade — sobe em qualquer domínio/host estático arrastando
um arquivo. NÃO use React/Vite/etc. NÃO use a chave do Supabase no front: toda a
escrita passa pela Edge Function abaixo (que usa service_role internamente).

──────────────────────────────────────────────────────────────────────────────
COMO IDENTIFICAR O CLIENTE (parâmetro de URL)
──────────────────────────────────────────────────────────────────────────────
O ID do cliente (UUID) vem na query string, parâmetro `c`:

    https://SEU-DOMINIO/?c=8f3a1c2e-....-....-....-............

No carregamento:
  - Leia `new URLSearchParams(location.search).get('c')`.
  - Se faltar ou não for um UUID válido, mostre uma tela de erro amigável
    ("Link inválido. Peça um novo link ao escritório.") e não renderize o form.
  - Valide o formato UUID:
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

──────────────────────────────────────────────────────────────────────────────
API — Edge Function (já existe e está no ar)
──────────────────────────────────────────────────────────────────────────────
Endpoint único (POST, JSON):

    https://wvltdjspytysuoybcfgb.supabase.co/functions/v1/landing-socioeconomico

NÃO precisa de header de Authorization nem apikey (a função é pública,
verify_jwt=false). Basta `Content-Type: application/json`.

Duas ações, escolhidas pelo campo `action` no corpo:

1) BUSCAR SAUDAÇÃO  — ao abrir a página
   Request:
     { "action": "fetch", "cliente_id": "<UUID>" }
   Response 200:
     { "ok": true, "primeiro_nome": "Maria", "ja_respondido": false }
   - Use `primeiro_nome` na saudação. Se vier vazio, use "Olá!" genérico.
   - Se `ja_respondido` for true, o cliente já enviou antes: mostre uma mensagem
     leve ("Você já enviou suas respostas — obrigado!") com a opção de
     responder de novo (atualiza os dados). Não bloqueie, só avise.
   Erros: 400 (cliente_id inválido), 404 (cliente não encontrado) — em ambos,
   mostre a tela de "Link inválido".

2) ENVIAR RESPOSTAS  — ao submeter o form
   Request:
     {
       "action": "submit",
       "cliente_id": "<UUID>",
       "dados": {
         "renda_mensal": "...",
         "dependentes": "...",
         "conjuge_trabalha": "...",
         "unico_provedor": "...",
         "tipo_moradia": "...",
         "condicao_saude": "...",
         "observacoes_livres": "..."
       }
     }
   Response 200:
     { "ok": true }
   - A função faz MERGE: só grava os campos que vierem preenchidos, não apaga o
     resto. Pode enviar só os que foram respondidos.
   - Trate erro de rede / status != 200 com uma mensagem ("Não conseguimos
     enviar, tente de novo") e botão de re-tentar. NÃO perca o que o cliente
     digitou.

──────────────────────────────────────────────────────────────────────────────
OS 7 CAMPOS (todos opcionais, mas incentive a responder tudo)
──────────────────────────────────────────────────────────────────────────────
Envie todos os valores como STRING. As perguntas devem soar humanas, não
técnicas. Sugestão de rótulo entre aspas; ajuste o visual à vontade.

1. renda_mensal        — "Qual é a sua renda por mês, mais ou menos?"
   Input numérico/dinheiro (R$). Pode ser campo com máscara simples. Envie só
   o número (ex.: "1500") ou o texto que o cliente digitou — o backend aceita
   string. Dica: placeholder "Ex.: 1.500".

2. dependentes         — "Quantas pessoas dependem de você financeiramente?
                          (filhos, pais, etc.) Conte um pouco."
   Campo de texto LARGO (uma linha ou textarea curto). Aceita texto livre,
   ex.: "2 filhos menores e minha mãe idosa".

3. conjuge_trabalha    — "Seu marido / sua esposa trabalha?"
   SELECT com 3 opções (envie exatamente estes VALUES):
     - "sim"            -> rótulo "Sim, trabalha"
     - "nao"            -> rótulo "Não trabalha"
     - "nao_se_aplica"  -> rótulo "Não tenho cônjuge / não se aplica"

4. unico_provedor      — "Você é a única pessoa que sustenta a casa?"
   SELECT com 2 opções (VALUES):
     - "sim" -> "Sim, sou o único sustento"
     - "nao" -> "Não, há outras rendas em casa"

5. tipo_moradia        — "A casa onde você mora é..."
   SELECT com 5 opções (VALUES):
     - "propria"     -> "Própria"
     - "alugada"     -> "Alugada"
     - "financiada"  -> "Financiada"
     - "cedida"      -> "Cedida / emprestada"
     - "outros"      -> "Outra situação"

6. condicao_saude      — "Você ou alguém da família tem algum problema de
                          saúde, doença ou deficiência? Se sim, qual?"
   Textarea. Texto livre. Deixe claro que pode deixar em branco se não houver.

7. observacoes_livres  — "Quer contar mais alguma coisa sobre a sua situação?
                          (opcional)"
   Textarea. Campo livre pro cliente desabafar / dar contexto.

──────────────────────────────────────────────────────────────────────────────
DESIGN / UX
──────────────────────────────────────────────────────────────────────────────
- Mobile-first. A maioria abre no celular.
- Paleta sóbria e profissional, transmitindo confiança (advocacia). Sugestão:
  fundo claro (#f7f7f8), cartão branco, texto escuro (#1a1a1a), um acento em
  roxo/grafite discreto. Sem cores berrantes. Cantos arredondados, espaçamento
  generoso, fonte Inter.
- Cabeçalho com o nome "AW ECO ME" (texto simples; não invente logo).
- Uma pergunta de cada vez OU todas numa coluna rolável — escolha o que ficar
  mais leve no celular; se fizer multi-step, mostre progresso (1 de 7).
- Botões grandes, área de toque confortável, labels acima dos campos.
- Microcopy tranquilizadora no topo: explique em 1-2 frases por que estão
  pedindo isso e que é sigiloso ("Suas respostas são confidenciais e usadas
  só para fortalecer o seu processo.").
- Estados: carregando (ao abrir e ao enviar), erro (com re-tentar), sucesso
  (tela de "Obrigado! Recebemos suas respostas.").
- Acessibilidade: labels associadas (for/id), contraste AA, navegação por
  teclado, `inputmode="numeric"` na renda.
- Sem rodapé corporativo pesado; só uma linha discreta ("AW ECO ME · seus
  dados estão seguros").

──────────────────────────────────────────────────────────────────────────────
CRITÉRIOS DE ACEITE
──────────────────────────────────────────────────────────────────────────────
[ ] Abrir sem `?c=` ou com UUID inválido -> tela de erro amigável, sem form.
[ ] Abrir com `?c=<uuid válido>` -> chama 'fetch', mostra "Olá, <nome>!".
[ ] `ja_respondido:true` -> avisa, mas permite reenviar.
[ ] Enviar -> chama 'submit' com os 7 campos como string -> tela de obrigado.
[ ] Falha de rede -> mensagem + re-tentar, sem perder o digitado.
[ ] Funciona como arquivo único estático, sem build, em qualquer host.
[ ] Nenhuma credencial/segredo do Supabase no código do front.

Entregue o index.html completo e pronto pra subir.

=== FIM DO PROMPT ===
```

## Notas operacionais (para você, não para colar)

- **Como gerar o link de um cliente:** pegue o `id` (UUID) do cliente na tabela
  `clientes` e monte `https://SEU-DOMINIO/?c=<id>`.
- **Endpoint:** `POST https://wvltdjspytysuoybcfgb.supabase.co/functions/v1/landing-socioeconomico`
- **Segurança:** a função usa `service_role` internamente, aceita só os 7 campos
  do whitelist e faz merge no `dados_socioeconomicos` (jsonb) — não dá pra
  vazar/alterar nada além disso, mesmo com a função pública.
- **Onde os dados aparecem:** no app interno, em ClienteDetail → "Perfil
  socioeconômico", e ficam disponíveis pro Writer montar a narrativa.
