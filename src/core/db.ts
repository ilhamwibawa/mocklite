// src/core/db.ts
import Database from "better-sqlite3";
import {
  Kysely,
  SqliteDialect,
  ParseJSONResultsPlugin,
  CreateTableBuilder,
} from "kysely";
import fs from "fs-extra";
import path from "path";
import pc from "picocolors";
import type { MockliteConfig, FieldType } from "./types";

/**
 * Manages the SQLite database operations for Mocklite.
 * Handles database connection, schema setup, and query execution using Kysely.
 */
export class MockDatabase {
  private db: Kysely<any>;
  private dbPath: string;

  /**
   * Initializes a new instance of the MockDatabase class.
   * Sets up the database file in the .mocklite directory and initializes the Kysely instance.
   * Resets the database on every start.
   */
  constructor() {
    // Store the database in the .mocklite folder to keep it hidden
    const dbDir = path.resolve(process.cwd(), ".mocklite");
    fs.ensureDirSync(dbDir);

    this.dbPath = path.join(dbDir, "db.sqlite");

    // Reset the database on every start to ensure the schema remains fresh and consistent with the config
    if (fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath);
    }

    this.db = new Kysely({
      dialect: new SqliteDialect({
        database: new Database(this.dbPath),
      }),
      plugins: [new ParseJSONResultsPlugin()],
    });
  }

  /**
   * Sets up the database schema based on the provided configuration.
   * Creates tables and columns as defined in the config.
   *
   * @param config - The Mocklite configuration object containing the schema definition.
   */
  async setup(config: MockliteConfig) {
    console.log(pc.cyan("⚙️  Setting up database schema..."));

    for (const table of config.schema) {
      let schemaBuilder = this.db.schema.createTable(table.table);

      // Iterate over each field in the configuration
      for (const [fieldName, fieldDef] of Object.entries(table.fields)) {
        schemaBuilder = this.parseField(schemaBuilder, fieldName, fieldDef);
      }

      await schemaBuilder.execute();
      console.log(pc.green(`   ✓ Table created: ${table.table}`));
    }
  }

  /**
   * Helper method to translate a field configuration into a Kysely SQL column definition.
   *
   * @param builder - The Kysely CreateTableBuilder instance.
   * @param name - The name of the field/column.
   * @param def - The field definition (string or object).
   * @returns The updated CreateTableBuilder instance.
   */
  private parseField(
    builder: CreateTableBuilder<any, any>,
    name: string,
    def: FieldType
  ) {
    // Case 1: Simple String definition (e.g., "pk", "fk:...", "faker...")
    if (typeof def === "string") {
      if (def === "pk") {
        return builder.addColumn(name, "integer", (col) =>
          col.primaryKey().autoIncrement()
        );
      }

      if (def.startsWith("fk:")) {
        // Format: "fk:users.id"
        const target = def.split(":")[1]; // users.id
        // Parse target table

        if (!target) {
          throw new Error(`Invalid FK definition: ${def}`);
        }

        const [targetTable, targetCol] = target.split(".");

        // Assume Foreign Key is an integer for safety
        return builder.addColumn(name, "integer", (col) =>
          col.references(`${targetTable}.${targetCol}`).onDelete("cascade")
        );
      }

      // Detect basic data types from the faker name (initial simple implementation)
      if (def.includes("number") || def.includes("int")) {
        return builder.addColumn(name, "integer");
      }

      if (def.includes("boolean")) {
        return builder.addColumn(name, "integer");
      }

      // Default: Text
      return builder.addColumn(name, "text");
    }

    // Case 2: Object Config (e.g., { type: "enum", ... })
    if (typeof def === "object") {
      // Logic for object config (to be expanded later)
      return builder.addColumn(name, "text");
    }

    return builder.addColumn(name, "text");
  }

  /**
   * Returns the underlying Kysely database instance.
   *
   * @returns The Kysely instance.
   */
  getInstance() {
    return this.db;
  }
}
