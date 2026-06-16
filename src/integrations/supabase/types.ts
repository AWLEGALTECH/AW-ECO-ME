export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      clientes: {
        Row: {
          cpf_cnpj: string | null
          created_at: string
          comarca: string | null
          uf: string | null
          dados_socioeconomicos: Json
          drive_folder_url: string | null
          email: string | null
          endereco: string | null
          estado_civil: string | null
          genero: string | null
          id: string
          nacionalidade: string | null
          nome: string
          observacoes: string | null
          orgao_expedidor: string | null
          origem: string | null
          precisa_analise_extratos: boolean | null
          profissao: string | null
          rg: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cpf_cnpj?: string | null
          created_at?: string
          comarca?: string | null
          uf?: string | null
          dados_socioeconomicos?: Json
          drive_folder_url?: string | null
          email?: string | null
          endereco?: string | null
          estado_civil?: string | null
          genero?: string | null
          id?: string
          nacionalidade?: string | null
          nome: string
          observacoes?: string | null
          orgao_expedidor?: string | null
          origem?: string | null
          precisa_analise_extratos?: boolean | null
          profissao?: string | null
          rg?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cpf_cnpj?: string | null
          created_at?: string
          comarca?: string | null
          uf?: string | null
          dados_socioeconomicos?: Json
          drive_folder_url?: string | null
          email?: string | null
          endereco?: string | null
          estado_civil?: string | null
          genero?: string | null
          id?: string
          nacionalidade?: string | null
          nome?: string
          observacoes?: string | null
          orgao_expedidor?: string | null
          origem?: string | null
          precisa_analise_extratos?: boolean | null
          profissao?: string | null
          rg?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contratos: {
        Row: {
          cliente_id: string
          created_at: string
          data_assinatura: string | null
          drive_url: string | null
          id: string
          modalidade: string
          motivo: string | null
          observacoes: string | null
          percentual_exito: number | null
          pre_cliente_id: string | null
          reus: string[] | null
          status: string
          updated_at: string
          valor_total: number | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_assinatura?: string | null
          drive_url?: string | null
          id?: string
          modalidade: string
          motivo?: string | null
          observacoes?: string | null
          percentual_exito?: number | null
          pre_cliente_id?: string | null
          reus?: string[] | null
          status?: string
          updated_at?: string
          valor_total?: number | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_assinatura?: string | null
          drive_url?: string | null
          id?: string
          modalidade?: string
          motivo?: string | null
          observacoes?: string | null
          percentual_exito?: number | null
          pre_cliente_id?: string | null
          reus?: string[] | null
          status?: string
          updated_at?: string
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_pre_cliente_id_fkey"
            columns: ["pre_cliente_id"]
            isOneToOne: false
            referencedRelation: "pre_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      demandas: {
        Row: {
          agencia: string | null
          analise_pai_id: string | null
          banco: string | null
          cliente_id: string
          comarca: string | null
          completed_at: string | null
          completed_by: string | null
          conta: string | null
          contrato_id: string | null
          created_at: string
          created_by: string | null
          data_fim_desconto: string | null
          data_inicio_desconto: string | null
          desconto: string | null
          descricao: string | null
          etapa: string
          id: string
          numero_processo: string | null
          ordem: number
          peca_drive_url: string | null
          processo_id: string | null
          protocolado_at: string | null
          protocolado_tribunal: string | null
          protocolo_drive_url: string | null
          status: string
          tipo: string
          titulo: string
          uf: string | null
          updated_at: string
          valor_causa: number | null
        }
        Insert: {
          agencia?: string | null
          analise_pai_id?: string | null
          banco?: string | null
          cliente_id: string
          comarca?: string | null
          completed_at?: string | null
          completed_by?: string | null
          conta?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_fim_desconto?: string | null
          data_inicio_desconto?: string | null
          desconto?: string | null
          descricao?: string | null
          etapa: string
          id?: string
          numero_processo?: string | null
          ordem?: number
          peca_drive_url?: string | null
          processo_id?: string | null
          protocolado_at?: string | null
          protocolado_tribunal?: string | null
          protocolo_drive_url?: string | null
          status?: string
          tipo: string
          titulo: string
          uf?: string | null
          updated_at?: string
          valor_causa?: number | null
        }
        Update: {
          agencia?: string | null
          analise_pai_id?: string | null
          banco?: string | null
          cliente_id?: string
          comarca?: string | null
          completed_at?: string | null
          completed_by?: string | null
          conta?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          data_fim_desconto?: string | null
          data_inicio_desconto?: string | null
          desconto?: string | null
          descricao?: string | null
          etapa?: string
          id?: string
          numero_processo?: string | null
          ordem?: number
          peca_drive_url?: string | null
          processo_id?: string | null
          protocolado_at?: string | null
          protocolado_tribunal?: string | null
          protocolo_drive_url?: string | null
          status?: string
          tipo?: string
          titulo?: string
          uf?: string | null
          updated_at?: string
          valor_causa?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "demandas_analise_pai_id_fkey"
            columns: ["analise_pai_id"]
            isOneToOne: false
            referencedRelation: "demandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_clientes: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          cliente_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          cpf_cnpj: string | null
          created_at: string
          dados_completos: Json
          drive_folder_id: string | null
          drive_folder_url: string | null
          email: string | null
          endereco_completo: string | null
          estado_civil: string | null
          id: string
          nacionalidade: string | null
          nome: string
          observacoes: string | null
          orgao_expedidor: string | null
          origem: string
          produto: string | null
          profissao: string | null
          rg: string | null
          rubricas: string[] | null
          status: string
          telefone: string | null
          updated_at: string
          valor_causa: number | null
          valor_lastro: number | null
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          cliente_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          dados_completos?: Json
          drive_folder_id?: string | null
          drive_folder_url?: string | null
          email?: string | null
          endereco_completo?: string | null
          estado_civil?: string | null
          id?: string
          nacionalidade?: string | null
          nome: string
          observacoes?: string | null
          orgao_expedidor?: string | null
          origem?: string
          produto?: string | null
          profissao?: string | null
          rg?: string | null
          rubricas?: string[] | null
          status?: string
          telefone?: string | null
          updated_at?: string
          valor_causa?: number | null
          valor_lastro?: number | null
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          cliente_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          dados_completos?: Json
          drive_folder_id?: string | null
          drive_folder_url?: string | null
          email?: string | null
          endereco_completo?: string | null
          estado_civil?: string | null
          id?: string
          nacionalidade?: string | null
          nome?: string
          observacoes?: string | null
          orgao_expedidor?: string | null
          origem?: string
          produto?: string | null
          profissao?: string | null
          rg?: string | null
          rubricas?: string[] | null
          status?: string
          telefone?: string | null
          updated_at?: string
          valor_causa?: number | null
          valor_lastro?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_clientes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      processos: {
        Row: {
          cliente_id: string
          comarca_uf: string | null
          created_at: string
          data_ultimo_andamento: string | null
          fase_processual: string | null
          id: string
          materia: string | null
          numero_processo: string
          observacoes: string | null
          parceiro: string | null
          prazo_processual: string | null
          status_tarefa: string | null
          tipo_pendencia: string | null
          updated_at: string
          valor_causa: number | null
          vara_juizo_origem: string | null
        }
        Insert: {
          cliente_id: string
          comarca_uf?: string | null
          created_at?: string
          data_ultimo_andamento?: string | null
          fase_processual?: string | null
          id?: string
          materia?: string | null
          numero_processo: string
          observacoes?: string | null
          parceiro?: string | null
          prazo_processual?: string | null
          status_tarefa?: string | null
          tipo_pendencia?: string | null
          updated_at?: string
          valor_causa?: number | null
          vara_juizo_origem?: string | null
        }
        Update: {
          cliente_id?: string
          comarca_uf?: string | null
          created_at?: string
          data_ultimo_andamento?: string | null
          fase_processual?: string | null
          id?: string
          materia?: string | null
          numero_processo?: string
          observacoes?: string | null
          parceiro?: string | null
          prazo_processual?: string | null
          status_tarefa?: string | null
          tipo_pendencia?: string | null
          updated_at?: string
          valor_causa?: number | null
          vara_juizo_origem?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved: boolean
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          nome: string | null
          role: string
          updated_at: string
        }
        Insert: {
          approved?: boolean
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          approved?: boolean
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_module_access: {
        Row: {
          granted_at: string
          granted_by: string | null
          module_key: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          module_key: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          module_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_module_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_module_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: { uid: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
