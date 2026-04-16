export type AIProvider = 'codex' | 'claude';
export type CodexReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
export type CodexReasoningPreference = 'default' | CodexReasoningEffort;

export interface ModelOption {
  id: string;
  display_name?: string;
  owned_by?: string;
  created?: number;
  default_reasoning_level?: CodexReasoningEffort;
  supported_reasoning_levels?: CodexReasoningEffort[];
  speed_tiers?: string[];
  supports_fast?: boolean;
}
