// Catálogo de módulos protegidos por permissão.
// A chave bate com a coluna user_module_access.module_key.
export const MODULES = [
  { key: "dashboard",    label: "Dashboard",     path: "/dashboard" },
  { key: "clientes",     label: "Clientes",      path: "/clientes" },
  { key: "pre_clientes", label: "Pré-clientes",  path: "/pre-clientes" },
  { key: "esteira",      label: "Esteira",       path: "/esteira" },
  { key: "publicacoes",  label: "Publicações",   path: "/publicacoes" },
  { key: "processos",    label: "Processos",     path: "/processos" },
  { key: "writer",       label: "Writer",        path: "/writer" },
  { key: "finder",       label: "Finder",        path: "/finder" },
  { key: "fechamentos",  label: "Fechamentos",   path: "/fechamentos" },
  { key: "balance",      label: "Balance",       path: "/balance" },
  { key: "tracker",      label: "Tracker",       path: "/tracker" },
  { key: "projetos",     label: "Projetos",      path: "/projetos" },
  { key: "chamados",     label: "Chamados",      path: "/chamados" },
  { key: "spy",          label: "Spy",           path: "/spy" },
  { key: "sheets",       label: "Sheets",        path: "/sheets" },
  { key: "marketing",    label: "Marketing",     path: "/marketing" },
] as const;

export type ModuleKey = typeof MODULES[number]["key"];

export const ALL_MODULE_KEYS: ModuleKey[] = MODULES.map(m => m.key);
