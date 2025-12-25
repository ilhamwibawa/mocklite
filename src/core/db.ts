// src/core/db.ts
import Database from "better-sqlite3";
import { Kysely, SqliteDialect, ParseJSONResultsPlugin } from "kysely";
import fs from "fs-extra";
import path from "path";
import pc from "picocolors";
import type { MockliteConfig, FieldType } from "./types";

export class MockDatabase {
  private db: Kysely<any>;
  private dbPath: string;

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

  // Helper method to translate Configuration to Kysely SQL
  private parseField(builder: any, name: string, def: FieldType) {
    // Case 1: Simple String definition (e.g., "pk", "fk:...", "faker...")
    if (typeof def === "string") {
      if (def === "pk") {
        return builder.addColumn(name, "integer", (col: any) =>
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
        return builder.addColumn(name, "integer", (col: any) =>
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

  getInstance() {
    return this.db;
  }
}
