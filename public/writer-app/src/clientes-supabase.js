/* =========================================================================
   CLIENTES SUPABASE — fonte real de clientes vindo do aw-eco-me
   Substitui o antigo CLIENTES_MOCK (Joao/Maria) por dados reais.
   - fetchClientesAW(): lista todos os clientes pra dropdown
   - fetchClienteAW(id): busca cliente especifico com todos os campos
                         (pacote 1 + pacote 2 via dados_socioeconomicos jsonb)
   Cada chamada usa o anon key publico (mesmo de pre-cliente.js).
   ========================================================================= */

const AW_SB_URL = "https://wvltdjspytysuoybcfgb.supabase.co";
const AW_SB_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2bHRkanNweXR5c3VveWJjZmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjAxNjEsImV4cCI6MjA5NDgzNjE2MX0.aTFKemNruwj70C3inSxfmz8DQm38ux9JGlq5GXuGL34";

function _awHeaders() {
  return { apikey: AW_SB_KEY, Authorization: `Bearer ${AW_SB_KEY}` };
}

// Converte registro do banco -> shape esperado pelo writer
//   pacote1: nome_completo, genero, nacionalidade, estado_civil, profissao,
//            rg, orgao_expedidor, cpf, endereco_completo
//   pacote2: idade, escolaridade, numero_filhos, idades_filhos,
//            conjuge_trabalha, renda_mensal, unico_provedor, tipo_moradia,
//            outros_dependentes, condicao_saude, observacoes_livres
function _dbToWriterShape(row) {
  if (!row) return null;
  const ds = row.dados_socioeconomicos || {};
  return {
    // metadata
    aw_id: row.id,
    // pacote 1
    nome_completo:      row.nome || '',
    genero:             row.genero || '',
    nacionalidade:      row.nacionalidade || 'brasileiro',
    estado_civil:       row.estado_civil || '',
    profissao:          row.profissao || '',
    rg:                 row.rg || '',
    orgao_expedidor:    row.orgao_expedidor || '',
    cpf:                row.cpf_cnpj || '',
    endereco_completo:  row.endereco || '',
    comarca:            row.comarca || '',
    uf:                 row.uf || '',
    telefone:           row.telefone || '',
    // pacote 2 (vindo do jsonb)
    idade:              ds.idade ?? '',
    escolaridade:       ds.escolaridade ?? '',
    numero_filhos:      ds.numero_filhos ?? '',
    idades_filhos:      ds.idades_filhos ?? '',
    conjuge_trabalha:   ds.conjuge_trabalha ?? '',
    renda_mensal:       ds.renda_mensal ?? '',
    unico_provedor:     ds.unico_provedor ?? '',
    tipo_moradia:       ds.tipo_moradia ?? '',
    outros_dependentes: ds.outros_dependentes ?? '',
    condicao_saude:     ds.condicao_saude ?? '',
    observacoes_livres: ds.observacoes_livres ?? '',
  };
}

async function fetchClientesAW() {
  try {
    const resp = await fetch(
      `${AW_SB_URL}/rest/v1/clientes?select=*&order=nome.asc`,
      { headers: _awHeaders() }
    );
    if (!resp.ok) { console.warn('[clientes-aw] fetch lista', resp.status); return []; }
    const rows = await resp.json();
    return rows.map(_dbToWriterShape).filter(Boolean);
  } catch (e) {
    console.warn('[clientes-aw] erro lista', e);
    return [];
  }
}

// Puxa banco/agencia/conta de uma demanda analise_vinculada — usado pra
// pre-preencher pacote 3 do writer quando vem de "Confeccionar peça".
async function fetchAnaliseVinculadaMeta(demandaId) {
  if (!demandaId) return null;
  try {
    const resp = await fetch(
      `${AW_SB_URL}/rest/v1/demandas?select=banco,agencia,conta,data_inicio_desconto,data_fim_desconto&id=eq.${encodeURIComponent(demandaId)}&limit=1`,
      { headers: _awHeaders() }
    );
    if (!resp.ok) { console.warn('[analise-meta] fetch', resp.status); return null; }
    const rows = await resp.json();
    return rows.length ? rows[0] : null;
  } catch (e) {
    console.warn('[analise-meta] erro', e);
    return null;
  }
}

async function fetchClienteAW(id) {
  if (!id) return null;
  try {
    const resp = await fetch(
      `${AW_SB_URL}/rest/v1/clientes?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
      { headers: _awHeaders() }
    );
    if (!resp.ok) { console.warn('[clientes-aw] fetch cliente', resp.status); return null; }
    const rows = await resp.json();
    return rows.length ? _dbToWriterShape(rows[0]) : null;
  } catch (e) {
    console.warn('[clientes-aw] erro cliente', e);
    return null;
  }
}

// Salva de volta no Supabase os campos do pacote 1 + pacote 2 do cliente
// que esta atualmente em state. Usado pra preencher dados que faltavam
// (cliente vindo de importacao da planilha original, sem qualificacao).
async function salvarDadosClienteAW(clienteId) {
  if (!clienteId) return { ok: false, reason: 'sem id' };
  const p1 = state.dadosPacote1 || {};
  const p2 = state.dadosPacote2 || {};
  const p3 = state.dadosPacote3 || {};

  // Monta payload — somente campos com algum valor (evita sobrescrever
  // dado existente com vazio se o user nao mexeu)
  const setIf = (obj, key, val) => {
    if (val !== undefined && val !== null && String(val).trim() !== '') obj[key] = val;
  };
  const update = {};
  setIf(update, 'nome',            p1.nome_completo);
  setIf(update, 'cpf_cnpj',        p1.cpf);
  setIf(update, 'rg',              p1.rg);
  setIf(update, 'orgao_expedidor', p1.orgao_expedidor);
  setIf(update, 'profissao',       p1.profissao);
  setIf(update, 'genero',          p1.genero);
  setIf(update, 'nacionalidade',   p1.nacionalidade);
  setIf(update, 'estado_civil',    p1.estado_civil);
  setIf(update, 'endereco',        p1.endereco_completo);
  // Comarca/UF do foro (pacote 3) voltam pro cadastro do cliente.
  setIf(update, 'comarca',         p3.comarca);
  setIf(update, 'uf',              p3.uf);

  // dados_socioeconomicos: pega o que tiver no pacote 2
  const camposP2 = [
    'idade','escolaridade','numero_filhos','idades_filhos','conjuge_trabalha',
    'renda_mensal','unico_provedor','tipo_moradia','outros_dependentes',
    'condicao_saude','observacoes_livres'
  ];
  const dadosSocio = {};
  for (const k of camposP2) {
    const v = p2[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') dadosSocio[k] = v;
  }
  if (Object.keys(dadosSocio).length > 0) update.dados_socioeconomicos = dadosSocio;

  if (Object.keys(update).length === 0) return { ok: true, skipped: true };

  try {
    const resp = await fetch(
      `${AW_SB_URL}/rest/v1/clientes?id=eq.${encodeURIComponent(clienteId)}`,
      {
        method: 'PATCH',
        headers: { ..._awHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(update),
      }
    );
    if (!resp.ok) {
      const t = await resp.text();
      console.warn('[clientes-aw] salvar falhou', resp.status, t);
      return { ok: false, error: t };
    }
    console.log('[clientes-aw] dados sincronizados pro cliente', clienteId);
    return { ok: true };
  } catch (e) {
    console.warn('[clientes-aw] excecao salvar', e);
    return { ok: false, error: String(e) };
  }
}

// Sincroniza os campos cliente_* do dadosKit de volta pra tabela `clientes`.
// Usado quando o kit foi gerado a partir de um cliente existente (puxado da
// base) e o usuario editou/completou dados — esses updates voltam pro banco.
// setIf: so atualiza campos com valor (nao apaga dado existente com vazio).
async function salvarDadosClienteDoKit(clienteId, dadosKit) {
  if (!clienteId || !dadosKit) return { ok: false, reason: 'sem id/dados' };
  const setIf = (obj, key, val) => {
    if (val !== undefined && val !== null && String(val).trim() !== '') obj[key] = val;
  };
  const update = {};
  setIf(update, 'nome',            dadosKit.cliente_nome_completo);
  setIf(update, 'cpf_cnpj',        dadosKit.cliente_cpf);
  setIf(update, 'rg',              dadosKit.cliente_rg);
  setIf(update, 'orgao_expedidor', dadosKit.cliente_orgao_expedidor);
  setIf(update, 'profissao',       dadosKit.cliente_profissao);
  setIf(update, 'genero',          dadosKit.cliente_genero);
  setIf(update, 'nacionalidade',   dadosKit.cliente_nacionalidade);
  setIf(update, 'estado_civil',    dadosKit.cliente_estado_civil);
  setIf(update, 'endereco',        dadosKit.cliente_endereco_completo);
  setIf(update, 'comarca',         dadosKit.cliente_comarca);
  setIf(update, 'uf',              dadosKit.cliente_uf);
  setIf(update, 'telefone',        dadosKit.cliente_whatsapp);

  if (Object.keys(update).length === 0) return { ok: true, skipped: true };

  try {
    const resp = await fetch(
      `${AW_SB_URL}/rest/v1/clientes?id=eq.${encodeURIComponent(clienteId)}`,
      {
        method: 'PATCH',
        headers: { ..._awHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(update),
      }
    );
    if (!resp.ok) {
      const t = await resp.text();
      console.warn('[clientes-aw] salvarDadosClienteDoKit falhou', resp.status, t);
      return { ok: false, error: t };
    }
    console.log('[clientes-aw] dados do kit sincronizados pro cliente', clienteId);
    return { ok: true };
  } catch (e) {
    console.warn('[clientes-aw] excecao salvarDadosClienteDoKit', e);
    return { ok: false, error: String(e) };
  }
}

// Aplica um shape de cliente no state, preenchendo pacote 1 e pacote 2
function aplicarClienteNoState(c) {
  if (!c) return;
  state.clienteSelecionado = c;
  state.dadosPacote1 = state.dadosPacote1 || {};
  state.dadosPacote2 = state.dadosPacote2 || {};
  [
    'nome_completo','genero','nacionalidade','estado_civil','profissao',
    'rg','orgao_expedidor','cpf','endereco_completo'
  ].forEach(k => { state.dadosPacote1[k] = c[k] || ''; });
  [
    'idade','escolaridade','numero_filhos','idades_filhos','conjuge_trabalha',
    'renda_mensal','unico_provedor','tipo_moradia','outros_dependentes',
    'condicao_saude','observacoes_livres'
  ].forEach(k => { state.dadosPacote2[k] = c[k] ?? ''; });
  // Comarca/UF do cliente auto-preenchem o foro da peça (pacote 3). Só
  // define se ainda não houver valor — assim não sobrescreve o que foi
  // herdado por cadeia (URL) ou já digitado pelo advogado.
  state.dadosPacote3 = state.dadosPacote3 || {};
  if (c.comarca && !state.dadosPacote3.comarca) state.dadosPacote3.comarca = c.comarca;
  if (c.uf && !state.dadosPacote3.uf) state.dadosPacote3.uf = c.uf;
}
