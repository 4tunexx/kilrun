'use client';

import { HelpCircle } from 'lucide-react';
import { HelpTabPanel, resetTutorialFlag } from '../editor-help';
import type { MapEditorPlugin } from '../engine/types';

export const helpPlugin: MapEditorPlugin = {
  id: 'help',
  slot: 'sidebar',
  label: 'Help',
  icon: HelpCircle,
  order: 170,
  render: (brains) => (
    <HelpTabPanel
      onStartTutorial={() => {
        resetTutorialFlag();
        brains.setTutorialOpen(true);
      }}
    />
  ),
};
