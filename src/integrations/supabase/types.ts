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
          drive_folder_url: string | null
          email: string | null
          endereco: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cpf_cnpj?: string | null
          created_at?: string
          drive_folder_url?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cpf_cnpj?: string | null
          created_at?: string
          drive_folder_url?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
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
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          nome: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
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
