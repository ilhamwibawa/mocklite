/**
 * Represents the definition of a field in the schema.
 * Can be a string (Faker path, "pk", "fk:...") or an object configuration.
 */
export type FieldType =
  | string
  | {
      type: string;
      options?: Record<string, unknown>;
      values?: (string | number)[];
    };

/**
 * Represents the schema configuration for a single table.
 */
export interface TableSchema {
  table: string;
  seed?: number;
  fields: Record<string, FieldType>;
}

/**
 * The main configuration interface for Mocklite.
 */
export interface MockliteConfig {
  port?: number;
  delay?: number;
  errorRate?: number;
  database?: "sqlite";
  schema: TableSchema[];
}
