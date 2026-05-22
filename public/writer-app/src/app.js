/* =========================================================================
   APP — bootstrap final
   Roda no DOMContentLoaded depois que TODOS os outros scripts carregaram.
   - inicializa state.seguranca com SEGURANCA_DEFAULT
   - chama render() inicial
   - carrega config Supabase (webhooks IA)
   ========================================================================= */
/* =========================================================================
   INIT
   ========================================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  state.seguranca = { ...SEGURANCA_DEFAULT };

  // Le contexto vindo do aw-eco-me (?cliente=...&modo=peticao&desconto=...)
  try {
    const sp = new URLSearchParams(window.location.search);
    const modo = sp.get('modo');
    const nome = sp.get('nome');
    const clienteId = sp.get('cliente');
    if (clienteId && typeof fetchClienteAW === 'function') {
      // Puxa o cliente completo do Supabase do aw-eco-me — pacote 1 + 2
      // ficam pre-preenchidos integralmente
      fetchClienteAW(clienteId).then(c => {
        if (c && typeof aplicarClienteNoState === 'function') {
          aplicarClienteNoState(c);
          if (typeof render === 'function') render();
        }
      });
    } else if (nome) {
      // Sem ID — pelo menos o nome vai vazio. Cobre cenarios legados.
      state.dadosPacote1 = state.dadosPacote1 || {};
      state.dadosPacote1.nome_completo  = nome;
      state.dadosPacote1.nacionalidade  = 'brasileiro';
    }
    if (modo === 'peticao') {
      // Guarda referencias da analise vinculada pro pacote 3 futuro
      state.contextoAnaliseVinculada = {
        analise_id:  sp.get('analise_id') || null,
        analise_url: sp.get('analise_url') || null,
        desconto:    sp.get('desconto') || null,
      };
      // Sugere produto baseado no nome do desconto (heuristica simples)
      const produtoSugerido = sugerirProdutoPorDesconto(sp.get('desconto') || '');
      if (produtoSugerido) {
        state.produtoSugeridoId = produtoSugerido.id;
        state.produtoSugeridoMotivo = produtoSugerido.motivo;
      }
    }
  } catch (e) { console.warn('[writer] erro lendo contexto da URL:', e); }

  render();
  atualizarBtnConfig();

  // Carrega lista de clientes reais do aw-eco-me (assincrono, sem bloquear)
  if (typeof fetchClientesAW === 'function') {
    fetchClientesAW().then(cs => {
      state.clientesAW = cs || [];
      if (typeof render === 'function') render();
    }).catch(e => console.warn('[clientes-aw]', e));
  }

  // Intercepta o "Voltar" do navegador pra NÃO sair do app.
  // Empilha estado inicial e, em cada popstate, roteia pra tela anterior
  // (mapa definido em voltarTela() no render.js). Se já estamos na raiz
  // (lobby), re-empilha pra impedir saída.
  try {
    history.replaceState({ tela: state.tela || 'lobby' }, '', '#' + (state.tela || 'lobby'));
  } catch (e) {}
  window.addEventListener('popstate', () => {
    const destino = voltarTela(state.tela);
    if (destino) {
      navegarPara(destino);
    } else {
      try { history.pushState({ tela: state.tela }, '', '#' + state.tela); } catch (e) {}
    }
  });

  // Carrega config central do Supabase
  const ok = await carregarConfigDoSupabase();
  atualizarBtnConfig();
  if (!ok) {
    console.warn('AW Writer: config não carregou do Supabase. ' +
                 'Admin pode configurar via botão de engrenagem.');
  }
});
