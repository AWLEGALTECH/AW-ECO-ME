/* =========================================================================
   SUPABASE — config central (URL dos webhooks) protegida por senha
   carregarConfigDoSupabase: GET no app_config (id=1)
   salvarConfigNoSupabase: RPC update_app_config (valida senha server-side)
   abrirConfig/destrancarConfig/salvarConfig: fluxo de modal de admin
   atualizarBtnConfig: feedback visual (verde se config OK, vermelho se faltando)
   IMPORTANTE: anon key é pública por design do Supabase. Senha de admin é
   validada server-side via RPC; nunca exposta no front.
   ========================================================================= */
/* =========================================================================
   CONFIG — Supabase como store central
   ========================================================================= */

// ⚠️ SUBSTITUA OS 2 VALORES ABAIXO pelos do seu projeto Supabase:
// - URL: está em Supabase → Project Settings → Data API → Project URL
// - anon key: está em Supabase → Project Settings → API Keys → anon public
const SUPABASE_URL = 'https://xmzkrkyftchyuygiamdv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhtemtya3lmdGNoeXV5Z2lhbWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MDY1NjgsImV4cCI6MjA5MjE4MjU2OH0.PzXOPcaAA_FRYtsKlfPzUKGfb-ydfTppEKtTNrX7TRs';

function supabaseConfigurado() {
  return SUPABASE_URL && !SUPABASE_URL.startsWith('COLAR_') &&
         SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('COLAR_');
}

async function carregarConfigDoSupabase() {
  if (!supabaseConfigurado()) {
    console.warn('Supabase não configurado no HTML. Cole URL e anon key no topo do script.');
    return false;
  }
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/app_config?id=eq.1&select=webhook_trechos,webhook_peca`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (!resp.ok) throw new Error('Supabase respondeu ' + resp.status);
    const rows = await resp.json();
    if (rows.length === 0) throw new Error('Tabela app_config vazia (rode o SQL de setup).');
    state.config.webhookTrechos = rows[0].webhook_trechos || '';
    state.config.webhookPeca    = rows[0].webhook_peca    || '';
    state.configCarregada = true;
    return true;
  } catch (e) {
    console.error('Erro ao carregar config:', e);
    return false;
  }
}

async function salvarConfigNoSupabase(senha, urlTrechos, urlPeca) {
  if (!supabaseConfigurado()) {
    throw new Error('Supabase não configurado no HTML');
  }
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_app_config`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_password: senha,
      p_webhook_trechos: urlTrechos,
      p_webhook_peca: urlPeca,
    }),
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const result = await resp.json();
  if (!result || result.ok !== true) {
    throw new Error(result?.error || 'Falha ao salvar');
  }
  return true;
}

function temConfigValida() {
  // Apenas o webhook de trechos é realmente necessário — a geração do .docx
  // agora acontece no próprio navegador. O webhook de peça é mantido no state
  // e no Supabase por compatibilidade, mas não é mais usado.
  return !!state.config.webhookTrechos;
}

// Guardamos a senha validada em memória (só durante a sessão) pra reusar no salvar
let _senhaValidada = '';

function mostrarEtapa(qual) {
  document.getElementById('modalStageGate').style.display  = qual === 'gate'  ? '' : 'none';
  document.getElementById('modalStagePanel').style.display = qual === 'panel' ? '' : 'none';
}

function abrirConfig() {
  // Sempre começa na etapa de senha
  mostrarEtapa('gate');
  document.getElementById('gatePasswordInput').value = '';
  const gateMsg = document.getElementById('gateMsg');
  if (gateMsg) { gateMsg.textContent = ''; gateMsg.className = 'modal-msg'; }
  _senhaValidada = '';
  document.getElementById('modalConfig').classList.remove('hidden');
  // Foca o campo da senha
  setTimeout(() => document.getElementById('gatePasswordInput').focus(), 50);
}

function fecharConfig() {
  document.getElementById('modalConfig').classList.add('hidden');
  _senhaValidada = '';
}

// Valida a senha no Supabase fazendo uma tentativa "dry-run": passa a senha
// e as URLs atuais (mesmas que já estão salvas). Se a senha bater, a RPC retorna
// {ok:true}. Se não, {ok:false, error:"Senha inválida"}.
async function destrancarConfig() {
  const senha = document.getElementById('gatePasswordInput').value;
  const gateMsg = document.getElementById('gateMsg');
  const btn = document.getElementById('btnDestrancar');

  if (!senha) {
    gateMsg.textContent = 'Digite a senha.';
    gateMsg.className = 'modal-msg modal-msg-err';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Verificando...';
  gateMsg.textContent = '';
  gateMsg.className = 'modal-msg';

  try {
    // Dry-run: passa a senha e as mesmas URLs atuais (não altera nada na prática)
    await salvarConfigNoSupabase(senha, state.config.webhookTrechos, state.config.webhookPeca);
    _senhaValidada = senha;
    // Popula os campos com as URLs atuais e avança
    document.getElementById('webhookTrechosInput').value = state.config.webhookTrechos;
    document.getElementById('webhookPecaInput').value    = state.config.webhookPeca;
    const panelMsg = document.getElementById('panelMsg');
    if (panelMsg) { panelMsg.textContent = ''; panelMsg.className = 'modal-msg'; }
    mostrarEtapa('panel');
  } catch (e) {
    gateMsg.textContent = 'Senha incorreta.';
    gateMsg.className = 'modal-msg modal-msg-err';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

async function salvarConfig() {
  const t = document.getElementById('webhookTrechosInput').value.trim();
  const p = document.getElementById('webhookPecaInput').value.trim();
  const panelMsg = document.getElementById('panelMsg');
  const btn = document.getElementById('btnSalvarConfig');

  if (!t || !p) {
    panelMsg.textContent = 'Preencha as duas URLs.';
    panelMsg.className = 'modal-msg modal-msg-err';
    return;
  }
  // Se não houve mudança, nem chama a API
  if (t === state.config.webhookTrechos && p === state.config.webhookPeca) {
    panelMsg.textContent = 'Nada mudou.';
    panelMsg.className = 'modal-msg';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Salvando...';
  panelMsg.textContent = '';
  panelMsg.className = 'modal-msg';

  try {
    await salvarConfigNoSupabase(_senhaValidada, t, p);
    state.config.webhookTrechos = t;
    state.config.webhookPeca = p;
    atualizarBtnConfig();
    panelMsg.textContent = '✓ Salvo. Refletirá pra todos no próximo load.';
    panelMsg.className = 'modal-msg modal-msg-ok';
    setTimeout(() => fecharConfig(), 1400);
  } catch (e) {
    panelMsg.textContent = 'Erro: ' + e.message;
    panelMsg.className = 'modal-msg modal-msg-err';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar alterações';
  }
}
function atualizarBtnConfig() {
  const btn = document.getElementById('configBtn');
  if (!btn) return;
  btn.classList.remove('configured', 'needs-config');
  if (temConfigValida()) btn.classList.add('configured');
  else btn.classList.add('needs-config');
}
