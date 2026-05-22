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
    if (nome) {
      // Sempre pre-preenche dadosPacote1 com qualificacao do cliente vindo
      // do contexto (mesmo no fluxo kit, e util pra reaproveitar dados)
      state.dadosPacote1 = state.dadosPacote1 || {};
      state.dadosPacote1.nome_completo  = nome;
      state.dadosPacote1.cpf            = sp.get('cpf') || '';
      state.dadosPacote1.rg             = sp.get('rg') || '';
      state.dadosPacote1.profissao      = sp.get('profissao') || '';
      state.dadosPacote1.endereco_completo = sp.get('endereco') || '';
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
