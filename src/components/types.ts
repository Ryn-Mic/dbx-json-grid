import type { JsonPath, JsonValue } from '../core/json';
import type { Locale } from '../host/bridge';
export type NodeAction = 'copy-path' | 'copy-value' | 'copy-key' | 'add' | 'rename' | 'delete' | 'focus';
export interface ViewProps {
  value: JsonValue;
  /** Raw document identity; any source/history change invalidates inline drafts. */
  revision: string;
  path: JsonPath;
  selected: JsonPath;
  onSelect(path: JsonPath): void;
  onEdit(path: JsonPath): void;
  onCommit(path: JsonPath, value: JsonValue): void;
  onAction(action: NodeAction, path: JsonPath): void;
  query: string;
  filter: boolean;
  expansion: 'default' | 'all' | 'none' | number;
  expansionVersion: number;
  disabled: boolean;
  locale: Locale;
}
