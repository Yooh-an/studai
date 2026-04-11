export type AIProvider = 'codex' | 'claude';

export interface ModelOption {
  id: string;
  display_name?: string;
  owned_by?: string;
  created?: number;
}
