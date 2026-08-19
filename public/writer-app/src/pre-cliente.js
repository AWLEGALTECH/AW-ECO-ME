/* =========================================================================
   PRE-CLIENTE — integracao com aw-eco-me Supabase
   Ao chegar na tela final do writer (renderDone), envia um snapshot
   dos dados do cliente como "pre-cliente" no banco do aw-eco-me, em
   estado 'aguardando_assinatura'. Depois alguem do escritorio confirma
   pos-assinatura do contrato e promove a cliente ativo.
   ========================================================================= */

const PRE_CLIENTE_SUPABASE_URL = 'https://wvltdjspytysuoybcfgb.supabase.co';
const PRE_CLIENTE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2bHRkanNweXR5c3VveWJjZmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjAxNjEsImV4cCI6MjA5NDgzNjE2MX0.aTFKemNruwj70C3inSxfmz8DQm38ux9JGlq5GXuGL34';

// guarda o ultimo id criado pra evitar duplicidade se o user voltar e re-entrar na done
let _ultimoPreClienteEnviado = null;

// Re-renderiza a tela "Pré-cliente adicionado" (kitPreCliente) quando o
// estado de criação/pasta-do-Drive muda em background.
function _refreshPreClienteTela() {
  try {
    if (typeof state !== 'undefined' && state.tela === 'kitPreCliente' && typeof render === 'function') render();
  } catch (e) { /* noop */ }
}

function _hashSnapshot(payload) {
  // chave simples baseada em nome+cpf+produto pra deduplica entre re-renders
  return [
    payload.nome,
    payload.cpf_cnpj,
    payload.produto,
    payload.valor_causa,
  ].join('|');
}

function _montarPayloadPreCliente() {
  // Dois fluxos no writer geram cliente:
  //   1. KIT (contrato + procuracao):    state.dadosKit (campos cliente_*)
  //   2. PETICAO (lobby -> pacote1..3):  state.dadosPacote1/2/3 + produtoSelecionado
  const ehKit = state.dadosKit && state.dadosKit.cliente_nome_completo;
  // Autor que fez o instrumento procuratorio — vem do shell via ?autor=Nome.
  // Vira o cadastrado_por do cliente quando o pre-cliente for convertido.
  let _autor = null;
  try { _autor = new URLSearchParams(window.location.search).get('autor') || null; } catch (e) {}

  if (ehKit) {
    const d = state.dadosKit;
    const modalidade = state.modalidadeSelecionada || {};
    const reus = Array.isArray(d.causa_reus) ? d.causa_reus.filter(Boolean) : [];
    return {
      nome:              d.cliente_nome_completo || null,
      cpf_cnpj:          d.cliente_cpf || null,
      rg:                d.cliente_rg || null,
      orgao_expedidor:   d.cliente_orgao_expedidor || null,
      estado_civil:      d.cliente_estado_civil || null,
      profissao:         d.cliente_profissao || null,
      nacionalidade:     d.cliente_nacionalidade || null,
      telefone:          d.cliente_whatsapp || null,
      email:             null,
      endereco_completo: d.cliente_endereco_completo || null,
      produto:           modalidade.nome || modalidade.id || 'Kit Contrato + Procuração',
      rubricas:          reus.length ? reus : null,  // reaproveita coluna pra listar reus
      valor_lastro:      null,
      valor_causa:       Number(d.honorarios_valor_total) || Number(d.honorarios_valor_inicial) || null,
      dados_completos: {
        fluxo: 'kit',
        dadosKit: d,
        modalidade: { id: modalidade.id, nome: modalidade.nome },
        gerado_em: new Date().toISOString(),
        cadastrado_por: _autor || 'Adria Mota',
        // Sobe pro topo do dados_completos porque quem confirma lê daqui, sem
        // ter que saber a forma interna do kit.
        parceiro: d.parceria && (d.parceiro_nome || '').trim() ? d.parceiro_nome.trim() : null,
      },
      status: 'aguardando_assinatura',
      origem: 'writer',
    };
  }

  // Fluxo PETICAO
  const p1 = state.dadosPacote1 || {};
  const p2 = state.dadosPacote2 || {};
  const p3 = state.dadosPacote3 || {};
  const produto = state.produtoSelecionado || {};

  const rubricasMarcadas = Object.keys(state.rubricas || {})
    .filter(k => state.rubricas[k] === true || (typeof state.rubricas[k] === 'object' && state.rubricas[k] && state.rubricas[k].marcada));

  return {
    nome:              p1.nome_completo || null,
    cpf_cnpj:          p1.cpf || null,
    rg:                p1.rg || null,
    orgao_expedidor:   p1.orgao_expedidor || null,
    estado_civil:      p1.estado_civil || null,
    profissao:         p1.profissao || null,
    nacionalidade:     p1.nacionalidade || null,
    telefone:          p1.telefone || p2.telefone || null,
    email:             p1.email || p2.email || null,
    endereco_completo: p1.endereco_completo || null,
    produto:           produto.nome || null,
    rubricas:          rubricasMarcadas.length ? rubricasMarcadas : null,
    valor_lastro:      Number(p3.valor_lastro) || null,
    valor_causa:       Number(p3.valor_causa) || null,
    dados_completos: {
      fluxo: 'peticao',
      pacote1: p1,
      pacote2: p2,
      pacote3: p3,
      produto: { id: produto.id, nome: produto.nome, sublabel: produto.sublabel, reu: produto.reu },
      rubricas: state.rubricas,
      gerado_em: new Date().toISOString(),
      cadastrado_por: _autor || 'Adria Mota',
    },
    status: 'aguardando_assinatura',
    origem: 'writer',
  };
}

async function salvarPreCliente() {
  console.log('[pre-cliente] salvarPreCliente() invocado');
  try {
    // GUARD: pre-cliente SO eh criado pelo fluxo do kit (contrato+procuracao).
    // Peticoes (fluxo lobby -> pacote1..3 -> done) nao geram pre-cliente.
    // Detecta o fluxo verificando se ha dadosKit com nome preenchido.
    const ehKit = state.dadosKit && state.dadosKit.cliente_nome_completo;
    if (!ehKit) {
      console.log('[pre-cliente] fluxo nao-kit detectado (peticao), nao envia');
      return { ok: true, skipped: 'fluxo_peticao' };
    }

    // Estado exibido na tela "Pré-cliente adicionado" (kitPreCliente).
    state.preClienteInfo = {
      status: 'pending',
      nome: state.dadosKit.cliente_nome_completo || null,
      id: null,
      driveUrl: null,
      driveStatus: 'pending',
    };

    // Cliente puxado da base oficial (dropdown 'Puxar da base de clientes'):
    // é um contrato NOVO pra quem já é cliente. Antes isso não gerava
    // pre_cliente nenhum, pra não duplicar a pessoa em `clientes` — mas o
    // efeito era pior do que o problema: a gestão de assinatura mora em
    // Pré-clientes, então o contrato sumia do fluxo e a ação não era
    // contabilizada.
    //
    // Agora o pre_cliente é criado carregando o `cliente_id`. Quem cuida de
    // não duplicar é a confirmação, do outro lado: vendo o cliente_id, ela
    // vincula ao cliente que já existe em vez de cadastrar outro.
    const clienteExistenteId = state.dadosKit.cliente_aw_id || null;
    if (clienteExistenteId && typeof salvarDadosClienteDoKit === 'function') {
      // Os dados editados no kit continuam voltando pra ficha do cliente.
      salvarDadosClienteDoKit(clienteExistenteId, state.dadosKit)
        .then(r => console.log('[pre-cliente] sync cliente existente:', r))
        .catch(e => console.warn('[pre-cliente] sync falhou:', e));
    }

    const payload = _montarPayloadPreCliente();
    if (clienteExistenteId) {
      payload.cliente_id = clienteExistenteId;
      // A pasta do Drive já existe: aproveita a do cliente em vez de criar
      // outra, e é ela que a confirmação vai propor.
      try {
        const c = typeof fetchClienteAWRaw === 'function' ? await fetchClienteAWRaw(clienteExistenteId) : null;
        if (c && c.drive_folder_url) {
          payload.drive_folder_url = c.drive_folder_url;
          payload.drive_folder_id = c.drive_folder_id || null;
        }
      } catch (e) { console.warn('[pre-cliente] nao consegui ler a pasta do cliente:', e); }
    }
    console.log('[pre-cliente] payload montado:', payload);

    // dedup: nao envia 2x o mesmo cliente+produto na mesma sessao
    const hash = _hashSnapshot(payload);
    if (_ultimoPreClienteEnviado === hash) {
      console.log('[pre-cliente] ja enviado nesta sessao (hash igual), skip');
      // Ja foi criado antes nesta sessao — nao deixa a tela no spinner eterno.
      if (state.preClienteInfo) { state.preClienteInfo.status = 'created'; state.preClienteInfo.driveStatus = 'fail'; }
      _refreshPreClienteTela();
      return { ok: true, skipped: true };
    }

    // valida minimo (nome eh NOT NULL no banco)
    if (!payload.nome) {
      console.warn('[pre-cliente] nome ausente em state.dadosPacote1.nome_completo, nao envia. state =', JSON.parse(JSON.stringify(state)));
      return { ok: false, error: 'nome_ausente' };
    }

    // Gera UUID localmente pro pre_cliente — assim sabemos o id sem precisar
    // de SELECT depois do INSERT (anon nao tem SELECT em pre_clientes).
    // O id eh usado pra chamar a edge function create-drive-folder a seguir.
    const preClienteId = (crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        }));
    payload.id = preClienteId;

    const resp = await fetch(`${PRE_CLIENTE_SUPABASE_URL}/rest/v1/pre_clientes`, {
      method: 'POST',
      headers: {
        'apikey': PRE_CLIENTE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${PRE_CLIENTE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        // 'return=minimal' evita o RETURNING (que falharia, pois anon
        // nao tem SELECT em pre_clientes — so authenticated tem).
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('[pre-cliente] supabase respondeu', resp.status, txt);
      return { ok: false, error: txt };
    }

    _ultimoPreClienteEnviado = hash;
    console.log('[pre-cliente] criado com sucesso (status ' + resp.status + ') id=' + preClienteId);
    if (state.preClienteInfo) { state.preClienteInfo.status = 'created'; state.preClienteInfo.id = preClienteId; }
    _refreshPreClienteTela();

    // Cliente da base já tem pasta: criar outra duplicaria o acervo dele.
    if (clienteExistenteId) {
      if (state.preClienteInfo) {
        state.preClienteInfo.driveStatus = payload.drive_folder_url ? 'ok' : 'fail';
        state.preClienteInfo.driveUrl = payload.drive_folder_url || null;
        state.preClienteInfo.clienteExistente = true;
      }
      _refreshPreClienteTela();
      return { ok: true, id: preClienteId, clienteExistente: true };
    }

    // Dispara criacao da pasta no Drive em background (fire-and-forget).
    // Se a edge function falhar (sem secrets, sem permissao), o pre_cliente
    // continua criado — o user pode criar a pasta manualmente ao confirmar.
    fetch(`${PRE_CLIENTE_SUPABASE_URL}/functions/v1/create-drive-folder`, {
      method: 'POST',
      headers: {
        'apikey': PRE_CLIENTE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${PRE_CLIENTE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pre_cliente_id: preClienteId }),
    }).then(async (r) => {
      if (!r.ok) {
        const t = await r.text();
        console.warn('[pre-cliente] create-drive-folder falhou', r.status, t);
        if (state.preClienteInfo) state.preClienteInfo.driveStatus = 'fail';
      } else {
        const d = await r.json();
        console.log('[pre-cliente] pasta no Drive criada:', d.folder_url);
        if (state.preClienteInfo) { state.preClienteInfo.driveStatus = 'ok'; state.preClienteInfo.driveUrl = d.folder_url || null; }
      }
      _refreshPreClienteTela();
    }).catch(e => {
      console.warn('[pre-cliente] erro chamando create-drive-folder', e);
      if (state.preClienteInfo) state.preClienteInfo.driveStatus = 'fail';
      _refreshPreClienteTela();
    });

    return { ok: true, id: preClienteId };
  } catch (e) {
    console.error('[pre-cliente] excecao:', e);
    if (state.preClienteInfo && state.preClienteInfo.status === 'pending') {
      state.preClienteInfo.status = 'error';
      _refreshPreClienteTela();
    }
    return { ok: false, error: String(e) };
  }
}
