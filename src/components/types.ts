import type { JsonPath, JsonValue } from '../core/json';
import type { Locale } from '../host/bridge';
export type NodeAction = 'copy-path' | 'copy-value' | 'copy-key' | 'add' | 'rename' | 'delete';
export interface ViewProps {
  value: JsonValue;
  /** Raw document identity; any source/history change invalidates inline drafts. */
  revision: string;
  path: JsonPath;
  selected: JsonPath;
  onSelect(path: JsonPath): void;
  onEdit(path: JsonPath): void;
  onCommit(path: JsonPath, value: JsonValue): void;
  /** Rename one property, or all occurrences of a column in an object array. Throws on collision. */
  onRename(path: JsonPath, key: string, column?: string): void;
  onAction(action: NodeAction, path: JsonPath): void;
  query: string;
  filter: boolean;
  expansion: 'default' | 'all' | 'none' | number;
  expansionVersion: number;
  disabled: boolean;
  locale: Locale;
  /** Inactive cached panels must not scroll the document or steal focus. */
  active?: boolean;
}
