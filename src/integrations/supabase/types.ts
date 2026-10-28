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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          bloqueado_ate: string | null
          installation_id: string
          pin_hash: string
          tentativas_erradas: number
          updated_at: string
        }
        Insert: {
          bloqueado_ate?: string | null
          installation_id?: string
          pin_hash: string
          tentativas_erradas?: number
          updated_at?: string
        }
        Update: {
          bloqueado_ate?: string | null
          installation_id?: string
          pin_hash?: string
          tentativas_erradas?: number
          updated_at?: string
        }
        Relationships: []
      }
      integrity_anchors: {
        Row: {
          criado_em: string
          id: number
          impressao_esquema: string
          installation_id: string
          nota: string | null
          sessoes: number
          topo_corrente: string | null
        }
        Insert: {
          criado_em?: string
          id?: number
          impressao_esquema: string
          installation_id?: string
          nota?: string | null
          sessoes?: number
          topo_corrente?: string | null
        }
        Update: {
          criado_em?: string
          id?: number
          impressao_esquema?: string
          installation_id?: string
          nota?: string | null
          sessoes?: number
          topo_corrente?: string | null
        }
        Relationships: []
      }
      monthly_rates: {
        Row: {
          closed_at: string | null
          days_worked: number
          hourly_rate: number | null
          installation_id: string
          month: number
          reopened_at: string | null
          session_count: number
          status: string
          total_seconds: number
          updated_at: string
          valor_total_fechamento: number | null
          year: number
        }
        Insert: {
          closed_at?: string | null
          days_worked?: number
          hourly_rate?: number | null
          installation_id?: string
          month: number
          reopened_at?: string | null
          session_count?: number
          status?: string
          total_seconds?: number
          updated_at?: string
          valor_total_fechamento?: number | null
          year: number
        }
        Update: {
          closed_at?: string | null
          days_worked?: number
          hourly_rate?: number | null
          installation_id?: string
          month?: number
          reopened_at?: string | null
          session_count?: number
          status?: string
          total_seconds?: number
          updated_at?: string
          valor_total_fechamento?: number | null
          year?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cpf: string | null
          created_at: string
          fuso_horario: string
          installation_id: string
          nome: string | null
          updated_at: string
          valor_hora_padrao: number | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          fuso_horario?: string
          installation_id?: string
          nome?: string | null
          updated_at?: string
          valor_hora_padrao?: number | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          fuso_horario?: string
          installation_id?: string
          nome?: string | null
          updated_at?: string
          valor_hora_padrao?: number | null
        }
        Relationships: []
      }
      session_audit: {
        Row: {
          action: string
          changed_at: string
          id: number
          installation_id: string
          new_ended_at: string | null
          new_hash: string | null
          old_ended_at: string | null
          old_hash: string | null
          reason: string | null
          session_id: string
        }
        Insert: {
          action: string
          changed_at?: string
          id?: number
          installation_id: string
          new_ended_at?: string | null
          new_hash?: string | null
          old_ended_at?: string | null
          old_hash?: string | null
          reason?: string | null
          session_id: string
        }
        Update: {
          action?: string
          changed_at?: string
          id?: number
          installation_id?: string
          new_ended_at?: string | null
          new_hash?: string | null
          old_ended_at?: string | null
          old_hash?: string | null
          reason?: string | null
          session_id?: string
        }
        Relationships: []
      }
      trusted_devices: {
        Row: {
          ativo: boolean
          criado_em: string
          device_id: string
          visto_em: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          device_id: string
          visto_em?: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          device_id?: string
          visto_em?: string
        }
        Relationships: []
      }
      work_sessions: {
        Row: {
          created_at: string
          duration_seconds: number | null
          end_geo_status: string | null
          end_latitude: number | null
          end_longitude: number | null
          ended_at: string | null
          id: string
          installation_id: string
          prev_hash: string | null
          recorded_ended_at: string | null
          recorded_started_at: string | null
          sealed_at: string | null
          session_hash: string | null
          start_geo_status: string | null
          start_latitude: number | null
          start_longitude: number | null
          started_at: string
          titular_cpf: string | null
          titular_nome: string | null
          updated_at: string
          workplace_id: string | null
          workplace_label: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          end_geo_status?: string | null
          end_latitude?: number | null
          end_longitude?: number | null
          ended_at?: string | null
          id?: string
          installation_id?: string
          prev_hash?: string | null
          recorded_ended_at?: string | null
          recorded_started_at?: string | null
          sealed_at?: string | null
          session_hash?: string | null
          start_geo_status?: string | null
          start_latitude?: number | null
          start_longitude?: number | null
          started_at?: string
          titular_cpf?: string | null
          titular_nome?: string | null
          updated_at?: string
          workplace_id?: string | null
          workplace_label?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          end_geo_status?: string | null
          end_latitude?: number | null
          end_longitude?: number | null
          ended_at?: string | null
          id?: string
          installation_id?: string
          prev_hash?: string | null
          recorded_ended_at?: string | null
          recorded_started_at?: string | null
          sealed_at?: string | null
          session_hash?: string | null
          start_geo_status?: string | null
          start_latitude?: number | null
          start_longitude?: number | null
          started_at?: string
          titular_cpf?: string | null
          titular_nome?: string | null
          updated_at?: string
          workplace_id?: string | null
          workplace_label?: string | null
        }
        Relationships: []
      }
      workplace_audit: {
        Row: {
          action: string
          changed_at: string
          endereco_anterior: string | null
          endereco_novo: string | null
          id: string
          motivo: string | null
          nome_anterior: string | null
          nome_novo: string | null
          workplace_id: string | null
        }
        Insert: {
          action: string
          changed_at?: string
          endereco_anterior?: string | null
          endereco_novo?: string | null
          id?: string
          motivo?: string | null
          nome_anterior?: string | null
          nome_novo?: string | null
          workplace_id?: string | null
        }
        Update: {
          action?: string
          changed_at?: string
          endereco_anterior?: string | null
          endereco_novo?: string | null
          id?: string
          motivo?: string | null
          nome_anterior?: string | null
          nome_novo?: string | null
          workplace_id?: string | null
        }
        Relationships: []
      }
      workplaces: {
        Row: {
          ativo: boolean
          criado_em: string
          encerrado_em: string | null
          endereco: string
          id: string
          installation_id: string
          latitude: number | null
          longitude: number | null
          nome: string
          raio_metros: number
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          encerrado_em?: string | null
          endereco: string
          id?: string
          installation_id?: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          raio_metros?: number
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          encerrado_em?: string | null
          endereco?: string
          id?: string
          installation_id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          raio_metros?: number
        }
        Relationships: []
      }
    }
    Views: {
      monthly_closures: {
        Row: {
          ano: number | null
          closed_at: string | null
          dias_trabalhados: number | null
          installation_id: string | null
          mes: number | null
          reopened_at: string | null
          status: string | null
          total_segundos_fechamento: number | null
          total_sessoes: number | null
          updated_at: string | null
          valor_hora_fechamento: number | null
          valor_total_fechamento: number | null
        }
        Insert: {
          ano?: number | null
          closed_at?: string | null
          dias_trabalhados?: number | null
          installation_id?: string | null
          mes?: number | null
          reopened_at?: string | null
          status?: string | null
          total_segundos_fechamento?: number | null
          total_sessoes?: number | null
          updated_at?: string | null
          valor_hora_fechamento?: number | null
          valor_total_fechamento?: never
        }
        Update: {
          ano?: number | null
          closed_at?: string | null
          dias_trabalhados?: number | null
          installation_id?: string | null
          mes?: number | null
          reopened_at?: string | null
          status?: string | null
          total_segundos_fechamento?: number | null
          total_sessoes?: number | null
          updated_at?: string | null
          valor_hora_fechamento?: number | null
          valor_total_fechamento?: never
        }
        Relationships: []
      }
    }
    Functions: {
      correct_session_end: {
        Args: { p_new_end: string; p_reason: string; p_session_id: string }
        Returns: undefined
      }
      device_authorize: {
        Args: { p_device: string; p_pin: string }
        Returns: Json
      }
      device_check: { Args: { p_device: string }; Returns: Json }
      pin_verify: { Args: { p_pin: string }; Returns: Json }
      session_hash_valid: { Args: { p_id: string }; Returns: boolean }
      set_workplace: {
        Args: {
          p_endereco: string
          p_lat?: number
          p_lng?: number
          p_nome: string
          p_raio?: number
          p_reason: string
        }
        Returns: string
      }
      integrity_state: {
        Args: never
        Returns: {
          impressao_esquema: string
          sessoes: number
          topo_corrente: string | null
          ultimo_marco_em: string | null
          ultimo_marco_impressao: string | null
        }[]
      }
      schema_fingerprint: {
        Args: never
        Returns: string
      }
      workplace_current: {
        Args: never
        Returns: {
          endereco: string
          id: string
          latitude: number
          longitude: number
          nome: string
          raio_metros: number
        }[]
      }
      ws_hash:
        | {
            Args: {
              p_cpf: string
              p_elat: number
              p_elng: number
              p_ended: string
              p_id: string
              p_installation: string
              p_nome: string
              p_prev: string
              p_slat: number
              p_slng: number
              p_started: string
            }
            Returns: string
          }
        | {
            Args: {
              p_cpf: string
              p_elat: number
              p_elng: number
              p_ended: string
              p_id: string
              p_installation: string
              p_nome: string
              p_prev: string
              p_slat: number
              p_slng: number
              p_started: string
              p_workplace: string
            }
            Returns: string
          }
        | {
            Args: {
              p_elat: number
              p_elng: number
              p_ended: string
              p_id: string
              p_installation: string
              p_prev: string
              p_slat: number
              p_slng: number
              p_started: string
            }
            Returns: string
          }
      ws_seal_payload:
        | {
            Args: {
              p_cpf: string
              p_duration: number
              p_elat: number
              p_elng: number
              p_ended: string
              p_id: string
              p_installation: string
              p_nome: string
              p_prev: string
              p_slat: number
              p_slng: number
              p_started: string
            }
            Returns: string
          }
        | {
            Args: {
              p_cpf: string
              p_duration: number
              p_elat: number
              p_elng: number
              p_ended: string
              p_id: string
              p_installation: string
              p_nome: string
              p_prev: string
              p_slat: number
              p_slng: number
              p_started: string
              p_workplace: string
            }
            Returns: string
          }
        | {
            Args: {
              p_duration: number
              p_elat: number
              p_elng: number
              p_ended: string
              p_id: string
              p_installation: string
              p_prev: string
              p_slat: number
              p_slng: number
              p_started: string
            }
            Returns: string
          }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
