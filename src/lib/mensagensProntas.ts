import { MessageCircle, Instagram, type LucideIcon } from "lucide-react";

// Catálogo de slots de mensagens prontas por usuário. Começa com 2 e
// cresce no tempo — pra adicionar um slot novo, basta incluir um item
// aqui (a coluna no banco é (user_id, chave) genérica, sem migration).
export interface SlotMensagem {
  chave: string;
  label: string;
  descricao: string;
  canal: "whatsapp" | "instagram";
  icon: LucideIcon;
  placeholder: string;
}

export const SLOTS_MENSAGENS: SlotMensagem[] = [
  {
    chave: "whatsapp_boas_vindas",
    label: "Boas-vindas (cliente aprovado)",
    descricao:
      "Enviada automaticamente pelo WhatsApp corporativo quando um pré-cliente é confirmado. Variáveis: {{nome}} (primeiro nome) e {{nome_completo}}.",
    canal: "whatsapp",
    icon: MessageCircle,
    placeholder: "Olá, {{nome}}! Aqui é o Dr. Matheus Enes…",
  },
  {
    chave: "whatsapp_saudacao",
    label: "Saudação WhatsApp",
    descricao: "Vem preenchida pronta ao clicar no botão de WhatsApp do lead.",
    canal: "whatsapp",
    icon: MessageCircle,
    placeholder: "Olá! Tudo bem? Aqui é da [empresa]…",
  },
  {
    chave: "instagram_saudacao",
    label: "Saudação Instagram",
    descricao: "Copiada pro clipboard ao abrir o Direct do lead — é só colar.",
    canal: "instagram",
    icon: Instagram,
    placeholder: "Oi! Vi o perfil de vocês e…",
  },
];

// Texto usado quando o usuário ainda não personalizou o slot
// whatsapp_boas_vindas — garante que o cliente sempre recebe algo.
export const BOAS_VINDAS_PADRAO = `Olá, {{nome}}! Seja muito bem-vindo(a) ao nosso escritório. 🤝

Aqui é o Dr. Matheus Enes, advogado responsável pelo seu caso. Seu cadastro foi concluído com sucesso e a partir de agora acompanho pessoalmente o andamento do seu processo.

Qualquer dúvida, é só me chamar por aqui!`;

// Substitui {{variavel}} pelo valor correspondente. Variáveis sem valor
// ficam como estão (melhor visível do que sumir silenciosamente).
export function renderMensagem(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, chave) =>
    vars[chave] != null && vars[chave] !== "" ? vars[chave] : m,
  );
}
