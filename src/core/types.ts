export type FieldType =
  | string
  | { type: string; options?: any; values?: any[] };

export interface TableSchema {
  table: string;
  seed?: number;
  fields: Record<string, FieldType>;
}

export interface MockliteConfig {
  port?: number;
  database?: "sqlite";
  schema: TableSchema[];
}
