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
      telefone:          null,
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
    },
    status: 'aguardando_assinatura',
    origem: 'writer',
  };
}

async function salvarPreCliente() {
  console.log('[pre-cliente] salvarPreCliente() invocado');
  try {
    const payload = _montarPayloadPreCliente();
    console.log('[pre-cliente] payload montado:', payload);

    // dedup: nao envia 2x o mesmo cliente+produto na mesma sessao
    const hash = _hashSnapshot(payload);
    if (_ultimoPreClienteEnviado === hash) {
      console.log('[pre-cliente] ja enviado nesta sessao (hash igual), skip');
      return { ok: true, skipped: true };
    }

    // valida minimo (nome eh NOT NULL no banco)
    if (!payload.nome) {
      console.warn('[pre-cliente] nome ausente em state.dadosPacote1.nome_completo, nao envia. state =', JSON.parse(JSON.stringify(state)));
      return { ok: false, error: 'nome_ausente' };
    }

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
    console.log('[pre-cliente] criado com sucesso (status ' + resp.status + ')');
    return { ok: true };
  } catch (e) {
    console.error('[pre-cliente] excecao:', e);
    return { ok: false, error: String(e) };
  }
}
