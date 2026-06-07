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
