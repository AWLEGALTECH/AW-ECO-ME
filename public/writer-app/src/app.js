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
