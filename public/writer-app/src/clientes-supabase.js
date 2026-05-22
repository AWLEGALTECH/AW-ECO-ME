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
}
