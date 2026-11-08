export type Language = 'en' | 'es';
export type Theme = 'frost' | 'sage' | 'night';
export type SessionStatus = 'idle' | 'live' | 'paused' | 'ended';
export interface DisplaySettings {
  churchName: string; serviceName: string; logo: string | null;
  logoPosition: 'left' | 'center' | 'right'; logoSize: number;
  theme: Theme; textSize: number; showOriginal: boolean; showSummary: boolean;
  motion: 'fluid' | 'gentle' | 'none'; accentColor: string;
}
export interface Segment {
  id: string; source: string; translation: string;
  kind: 'speech' | 'scripture' | 'paraphrase'; reference: string | null;
  verified?: boolean; timestamp: number;
}
export interface RoomState {
  id: string; status: SessionStatus; mode: 'demo' | 'live';
  sourceLanguage: Language; targetLanguage: Language; settings: DisplaySettings;
  segments: Segment[]; summary: string; summaryUpdatedAt?: number; summaryStale?: boolean;
  blank: boolean; micConnected: boolean; micName: string; startedAt?: number;
  displayToken?: string; micToken?: string;
}
export const defaultSettings: DisplaySettings = {
  churchName: 'Grace Community', serviceName: 'Sunday service', logo: null,
  logoPosition: 'left', logoSize: 48, theme: 'frost', textSize: 68,
  showOriginal: true, showSummary: true, motion: 'fluid', accentColor: '#f47342',
};
export type RoomEvent = { type: 'state'; state: RoomState } | { type: 'error'; message: string } | { type: 'pong' };
