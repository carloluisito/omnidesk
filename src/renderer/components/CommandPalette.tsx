/**
 * CommandPalette — public re-export of CommandPaletteV2.
 * The v2 design is the unconditional implementation.
 */

import { CommandPaletteV2 } from './CommandPaletteV2';
import { PromptTemplate } from '../../shared/types/prompt-templates';
import { FuzzySearchResult } from '../utils/fuzzy-search';
import type { SessionMetadata } from '../../shared/ipc-types';

export interface CommandPaletteProps {
  isOpen: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  results: FuzzySearchResult<PromptTemplate>[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onSelectTemplate: (template: PromptTemplate) => void;
  onClose: () => void;
  onManageTemplates: () => void;
  onSelectSession?: (sessionId: string) => void;
  activeSessionId?: string | null;
  sessions?: SessionMetadata[];
  onOpenSettings?: (category: string) => void;
}

// Pure pass-through to CommandPaletteV2. No hooks called here.
export function CommandPalette(props: CommandPaletteProps) {
  return (
    <CommandPaletteV2
      isOpen={props.isOpen}
      onClose={props.onClose}
      onSelectTemplate={props.onSelectTemplate}
      onSelectSession={props.onSelectSession}
      activeSessionId={props.activeSessionId}
      sessions={props.sessions}
      onManageTemplates={props.onManageTemplates}
      onOpenSettings={props.onOpenSettings}
    />
  );
}
