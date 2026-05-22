/* =========================================================================
   APP — bootstrap final
   Roda no DOMContentLoaded depois que TODOS os outros scripts carregaram.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  state.seguranca = { ...SEGURANCA_DEFAULT };

  // Le contexto vindo do aw-eco-me (?cliente=...&modo=peticao&desconto=...)
  let preloadClientePromise = null;
  try {
    const sp = new URLSearchParams(window.location.search);
    const modo = sp.get('modo');
    const nome = sp.get('nome');
    const clienteId = sp.get('cliente');

    if (clienteId && typeof fetchClienteAW === 'function') {
      // BLOQUEANTE: aguardamos antes do primeiro render pra garantir que
      // pacote 1 e pacote 2 ja venham preenchidos quando o user vir a tela.
      // Timeout de 3s pra nao travar caso a rede esteja ruim — se estourar,
      // segue sem cliente e o user puxa manualmente.
      preloadClientePromise = Promise.race([
        fetchClienteAW(clienteId),
        new Promise(r => setTimeout(() => r(null), 3000)),
      ]);
    } else if (nome) {
      state.dadosPacote1 = state.dadosPacote1 || {};
      state.dadosPacote1.nome_completo  = nome;
      state.dadosPacote1.nacionalidade  = 'brasileiro';
    }

    if (modo === 'peticao') {
      state.contextoAnaliseVinculada = {
        analise_id:  sp.get('analise_id') || null,
        analise_url: sp.get('analise_url') || null,
        desconto:    sp.get('desconto') || null,
      };
      const produtoSugerido = sugerirProdutoPorDesconto(sp.get('desconto') || '');
      if (produtoSugerido) {
        state.produtoSugeridoId = produtoSugerido.id;
        state.produtoSugeridoMotivo = produtoSugerido.motivo;
      }
    }
  } catch (e) { console.warn('[writer] erro lendo contexto da URL:', e); }

  // Aguarda o cliente carregar ANTES do primeiro render — ai a UI ja sobe
  // com pacote 1 + pacote 2 preenchidos
  if (preloadClientePromise) {
    try {
      const c = await preloadClientePromise;
      if (c && typeof aplicarClienteNoState === 'function') {
        aplicarClienteNoState(c);
        // Tambem ja deixa esse cliente no cache da lista (evita 2a chamada)
        state.clientesAW = state.clientesAW || [];
        if (!state.clientesAW.some(x => x.aw_id === c.aw_id)) {
          state.clientesAW.push(c);
        }
      } else if (!c) {
        console.warn('[writer] preload cliente timeout/null — siga manual');
      }
    } catch (e) {
      console.warn('[writer] preload cliente falhou:', e);
    }
  }

  render();
  atualizarBtnConfig();

  // Carrega lista completa de clientes em background (nao bloqueia)
  if (typeof fetchClientesAW === 'function') {
    fetchClientesAW().then(cs => {
      // mantem o pre-carregado se ja estiver no array
      const map = new Map((cs || []).map(c => [c.aw_id, c]));
      for (const c of (state.clientesAW || [])) {
        if (!map.has(c.aw_id)) map.set(c.aw_id, c);
      }
      state.clientesAW = Array.from(map.values()).sort((a, b) =>
        (a.nome_completo || '').localeCompare(b.nome_completo || '', 'pt-BR'));
      if (typeof render === 'function') render();
    }).catch(e => console.warn('[clientes-aw]', e));
  }

  // Intercepta o "Voltar" do navegador pra NAO sair do app.
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

  // Config central do Supabase
  const ok = await carregarConfigDoSupabase();
  atualizarBtnConfig();
  if (!ok) {
    console.warn('AW Writer: config nao carregou do Supabase. ' +
                 'Admin pode configurar via botao de engrenagem.');
  }
});
