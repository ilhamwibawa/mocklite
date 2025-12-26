export type FieldType =
  | string
  | {
      type: string;
      options?: Record<string, unknown>;
      values?: (string | number)[];
    };

export interface TableSchema {
  table: string;
  seed?: number;
  fields: Record<string, FieldType>;
}

export interface MockliteConfig {
  port?: number;
  delay?: number;
  errorRate?: number;
  database?: "sqlite";
  schema: TableSchema[];
}
