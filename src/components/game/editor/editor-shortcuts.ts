/** Single source of truth for map-editor hotkeys — Help, menus, and tooltips. */

export type EditorShortcutGroup =
  | 'file'
  | 'edit'
  | 'view'
  | 'tools'
  | 'transform'
  | 'selection';

export type EditorShortcut = {
  id: string;
  keys: string;
  action: string;
  group: EditorShortcutGroup;
};

export const EDITOR_SHORTCUT_GROUPS: { id: EditorShortcutGroup; label: string }[] = [
  { id: 'file', label: 'File' },
  { id: 'edit', label: 'Edit' },
  { id: 'view', label: 'View' },
  { id: 'tools', label: 'Tools' },
  { id: 'transform', label: 'Transform' },
  { id: 'selection', label: 'Selection' },
];

export const EDITOR_SHORTCUTS: EditorShortcut[] = [
  { id: 'save', keys: 'Ctrl+S', action: 'Save map', group: 'file' },

  { id: 'undo', keys: 'Ctrl+Z', action: 'Undo', group: 'edit' },
  { id: 'redo', keys: 'Ctrl+Y', action: 'Redo', group: 'edit' },
  { id: 'duplicate', keys: 'Ctrl+D', action: 'Duplicate (+X)', group: 'edit' },
  { id: 'duplicate-z', keys: 'Ctrl+Shift+D', action: 'Duplicate (+Z)', group: 'edit' },
  { id: 'delete', keys: 'Delete', action: 'Delete selection', group: 'edit' },
  { id: 'group', keys: 'Ctrl+G', action: 'Group selection', group: 'edit' },
  { id: 'ungroup', keys: 'Ctrl+Shift+G', action: 'Ungroup selection', group: 'edit' },

  { id: 'toggle-ui', keys: 'Ctrl+H', action: 'Hide / show editor UI', group: 'view' },
  { id: 'escape', keys: 'Esc', action: 'Cancel place, show UI, deselect', group: 'view' },
  { id: 'focus', keys: 'F', action: 'Focus camera on selection', group: 'view' },
  { id: 'grid-snap', keys: 'G', action: 'Toggle grid snap', group: 'view' },
  { id: 'free-fly', keys: 'Ctrl', action: 'Hold for free fly (toolbar Fly to lock)', group: 'view' },

  { id: 'select', keys: 'V', action: 'Select tool (cancels placement)', group: 'tools' },
  { id: 'brush', keys: 'B', action: 'Brush — place the active model', group: 'tools' },
  { id: 'bucket', keys: 'P', action: 'Paint bucket — hold-drag place', group: 'tools' },
  { id: 'hammer', keys: 'H', action: 'Hammer++ solids', group: 'tools' },
  { id: 'magnet', keys: 'M', action: 'Attach to nearest object, or pick a face (2+ selected)', group: 'tools' },

  { id: 'move', keys: 'W', action: 'Move gizmo', group: 'transform' },
  { id: 'rotate', keys: 'E', action: 'Rotate gizmo', group: 'transform' },
  { id: 'scale', keys: 'R', action: 'Scale gizmo', group: 'transform' },
  { id: 'shift-snap', keys: 'Shift', action: 'Hold for exact grid snap while dragging', group: 'transform' },

  { id: 'select-none', keys: 'Esc', action: 'Clear selection', group: 'selection' },
  { id: 'box-select', keys: 'Alt+drag', action: 'Box select', group: 'selection' },
  { id: 'multi-select', keys: 'Shift+click', action: 'Add to selection', group: 'selection' },
];

export function editorShortcut(id: string): EditorShortcut | undefined {
  return EDITOR_SHORTCUTS.find((row) => row.id === id);
}

export function shortcutKeys(id: string): string | undefined {
  return editorShortcut(id)?.keys;
}

/** Native `title` / tooltip line: "Action (Keys)". */
export function shortcutTitle(id: string, extra?: string): string {
  const row = editorShortcut(id);
  if (!row) return extra ?? '';
  const body = extra ?? row.action;
  return `${body} (${row.keys})`;
}
