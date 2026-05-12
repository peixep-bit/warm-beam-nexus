export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      contestacoes: {
        Row: {
          anexo_url: string | null
          created_at: string
          data_abertura: string
          data_resolucao: string | null
          id: string
          observacao: string | null
          statement_item_id: string
          status: string
          tipo: string
          updated_at: string
          user_id: string
          valor_contestado: number
          valor_recuperado: number
        }
        Insert: {
          anexo_url?: string | null
          created_at?: string
          data_abertura?: string
          data_resolucao?: string | null
          id?: string
          observacao?: string | null
          statement_item_id: string
          status?: string
          tipo: string
          updated_at?: string
          user_id: string
          valor_contestado?: number
          valor_recuperado?: number
        }
        Update: {
          anexo_url?: string | null
          created_at?: string
          data_abertura?: string
          data_resolucao?: string | null
          id?: string
          observacao?: string | null
          statement_item_id?: string
          status?: string
          tipo?: string
          updated_at?: string
          user_id?: string
          valor_contestado?: number
          valor_recuperado?: number
        }
        Relationships: []
      }
      fee_rules: {
        Row: {
          base_field: string
          created_at: string
          description: string | null
          fixed_amount: number | null
          id: string
          marca: string | null
          name: string
          percentage: number | null
          platform_id: string
          type: string
          user_id: string
        }
        Insert: {
          base_field?: string
          created_at?: string
          description?: string | null
          fixed_amount?: number | null
          id?: string
          marca?: string | null
          name: string
          percentage?: number | null
          platform_id: string
          type: string
          user_id: string
        }
        Update: {
          base_field?: string
          created_at?: string
          description?: string | null
          fixed_amount?: number | null
          id?: string
          marca?: string | null
          name?: string
          percentage?: number | null
          platform_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_rules_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      platforms: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          user_id?: string
        }
        Relationships: []
      }
      statement_imports: {
        Row: {
          cnpj: string | null
          created_at: string
          file_name: string
          id: string
          loja: string | null
          marca: string | null
          period_end: string | null
          period_start: string | null
          platform_id: string
          source_type: string
          status: string
          total_bruto: number | null
          total_descontos: number | null
          total_repasse: number | null
          total_taxas: number | null
          user_id: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          file_name: string
          id?: string
          loja?: string | null
          marca?: string | null
          period_end?: string | null
          period_start?: string | null
          platform_id: string
          source_type?: string
          status?: string
          total_bruto?: number | null
          total_descontos?: number | null
          total_repasse?: number | null
          total_taxas?: number | null
          user_id: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          file_name?: string
          id?: string
          loja?: string | null
          marca?: string | null
          period_end?: string | null
          period_start?: string | null
          platform_id?: string
          source_type?: string
          status?: string
          total_bruto?: number | null
          total_descontos?: number | null
          total_repasse?: number | null
          total_taxas?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_imports_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_items: {
        Row: {
          cnpj: string | null
          created_at: string
          data_prevista_repasse: string | null
          data_transacao: string
          desconto: number | null
          descricao: string | null
          divergencia_tipo: string
          divergencia_valor: number
          forma_pagamento: string | null
          id: string
          import_id: string
          incentivo_ifood: number | null
          incentivo_loja: number | null
          incentivo_rede: number | null
          loja: string | null
          marca: string | null
          numero_pedido: string | null
          order_status: string
          quantidade_pedidos: number | null
          source_type: string
          status: string | null
          taxa: number | null
          taxa_servico: number | null
          taxas_comissoes: number | null
          tratativa_atualizada_em: string | null
          tratativa_observacao: string | null
          tratativa_status: string
          user_id: string
          valor_bruto: number
          valor_liquido: number
          valor_liquido_conciliado: number | null
          valor_pdv: number | null
          valor_taxa_entrega: number | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          data_prevista_repasse?: string | null
          data_transacao: string
          desconto?: number | null
          descricao?: string | null
          divergencia_tipo?: string
          divergencia_valor?: number
          forma_pagamento?: string | null
          id?: string
          import_id: string
          incentivo_ifood?: number | null
          incentivo_loja?: number | null
          incentivo_rede?: number | null
          loja?: string | null
          marca?: string | null
          numero_pedido?: string | null
          order_status?: string
          quantidade_pedidos?: number | null
          source_type?: string
          status?: string | null
          taxa?: number | null
          taxa_servico?: number | null
          taxas_comissoes?: number | null
          tratativa_atualizada_em?: string | null
          tratativa_observacao?: string | null
          tratativa_status?: string
          user_id: string
          valor_bruto?: number
          valor_liquido?: number
          valor_liquido_conciliado?: number | null
          valor_pdv?: number | null
          valor_taxa_entrega?: number | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          data_prevista_repasse?: string | null
          data_transacao?: string
          desconto?: number | null
          descricao?: string | null
          divergencia_tipo?: string
          divergencia_valor?: number
          forma_pagamento?: string | null
          id?: string
          import_id?: string
          incentivo_ifood?: number | null
          incentivo_loja?: number | null
          incentivo_rede?: number | null
          loja?: string | null
          marca?: string | null
          numero_pedido?: string | null
          order_status?: string
          quantidade_pedidos?: number | null
          source_type?: string
          status?: string | null
          taxa?: number | null
          taxa_servico?: number | null
          taxas_comissoes?: number | null
          tratativa_atualizada_em?: string | null
          tratativa_observacao?: string | null
          tratativa_status?: string
          user_id?: string
          valor_bruto?: number
          valor_liquido?: number
          valor_liquido_conciliado?: number | null
          valor_pdv?: number | null
          valor_taxa_entrega?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "statement_items_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "statement_imports"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
