export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.5' };
  public: {
    Tables: {
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      proposals: {
        Row: {
          app_type: string;
          availability: Database['public']['Enums']['availability_level'];
          created_at: string;
          description: string;
          estimated_users: number;
          id: string;
          inserted_at: string;
          migration_goal: string;
          selected_region: string;
          selected_services: string[];
          solution_name: string;
          status: Database['public']['Enums']['proposal_status'];
          user_id: string;
        };
        Insert: {
          app_type: string;
          availability?: Database['public']['Enums']['availability_level'];
          created_at?: string;
          description?: string;
          estimated_users?: number;
          id?: string;
          inserted_at?: string;
          migration_goal?: string;
          selected_region?: string;
          selected_services?: string[];
          solution_name: string;
          status?: Database['public']['Enums']['proposal_status'];
          user_id: string;
        };
        Update: {
          app_type?: string;
          availability?: Database['public']['Enums']['availability_level'];
          created_at?: string;
          description?: string;
          estimated_users?: number;
          id?: string;
          inserted_at?: string;
          migration_goal?: string;
          selected_region?: string;
          selected_services?: string[];
          solution_name?: string;
          status?: Database['public']['Enums']['proposal_status'];
          user_id?: string;
        };
        Relationships: [];
      };
      cost_items: {
        Row: {
          annual_cost: number;
          category: Database['public']['Enums']['service_category'];
          estimated_hours: number;
          id: string;
          inserted_at: string;
          monthly_cost: number;
          notes: string | null;
          quantity: number;
          service_id: string;
          service_name: string;
          unit_cost: number;
          user_id: string;
        };
        Insert: {
          annual_cost?: number;
          category?: Database['public']['Enums']['service_category'];
          estimated_hours?: number;
          id?: string;
          inserted_at?: string;
          monthly_cost?: number;
          notes?: string | null;
          quantity?: number;
          service_id: string;
          service_name: string;
          unit_cost?: number;
          user_id: string;
        };
        Update: {
          annual_cost?: number;
          category?: Database['public']['Enums']['service_category'];
          estimated_hours?: number;
          id?: string;
          inserted_at?: string;
          monthly_cost?: number;
          notes?: string | null;
          quantity?: number;
          service_id?: string;
          service_name?: string;
          unit_cost?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      project_analyses: {
        Row: {
          analyzed_at: string;
          id: string;
          overall_security_score: number;
          payload: Json;
          project_name: string;
          total_findings: number;
          user_id: string;
        };
        Insert: {
          analyzed_at?: string;
          id?: string;
          overall_security_score?: number;
          payload: Json;
          project_name: string;
          total_findings?: number;
          user_id: string;
        };
        Update: {
          analyzed_at?: string;
          id?: string;
          overall_security_score?: number;
          payload?: Json;
          project_name?: string;
          total_findings?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          origin: Json | null;
          region_code: string;
          seeded_at: string | null;
          theme: Database['public']['Enums']['theme_preference'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          origin?: Json | null;
          region_code?: string;
          seeded_at?: string | null;
          theme?: Database['public']['Enums']['theme_preference'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          origin?: Json | null;
          region_code?: string;
          seeded_at?: string | null;
          theme?: Database['public']['Enums']['theme_preference'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      availability_level: 'Básica' | 'Media' | 'Alta';
      proposal_status: 'Aprobada' | 'En revisión' | 'Borrador';
      service_category: 'Compute' | 'Storage' | 'Database' | 'Security' | 'Networking' | 'Content Delivery' | 'Monitoring';
      theme_preference: 'dark' | 'light';
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];