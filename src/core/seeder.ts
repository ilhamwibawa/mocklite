import { Kysely } from "kysely";
import { faker } from "@faker-js/faker";
import pc from "picocolors";
import type { MockliteConfig, FieldType } from "./types";

/**
 * Handles database seeding with fake data based on the configuration.
 */
export class Seeder {
  constructor(private db: Kysely<any>) {}

  /**
   * Clears all data from the tables defined in the configuration.
   *
   * @param config - The Mocklite configuration object.
   */
  async clear(config: MockliteConfig) {
    for (const table of config.schema) {
      try {
        await this.db.deleteFrom(table.table).execute();
      } catch (e) {
        // ignore
      }
    }
  }

  /**
   * Runs the seeding process for all tables defined in the configuration.
   * Generates fake data and inserts it into the database.
   *
   * @param config - The Mocklite configuration object.
   */
  async run(config: MockliteConfig) {
    console.log(pc.cyan("🌱 Seeding database..."));

    for (const table of config.schema) {
      const count = table.seed || 0;
      if (count === 0) continue;

      const rows: Record<string, unknown>[] = [];
      console.log(pc.dim(`   Generaring ${count} rows for ${table.table}...`));

      for (let i = 0; i < count; i++) {
        const row = await this.generateRow(table.fields);
        rows.push(row);
      }

      if (rows.length > 0) {
        await this.db.insertInto(table.table).values(rows).execute();
      }
    }

    console.log(pc.green("✨ Seeding complete!"));
  }

  /**
   * Generates a single row of fake data based on the field definitions.
   * Handles Foreign Keys by fetching existing IDs from the database.
   *
   * @param fields - The field definitions for the table.
   * @returns A promise that resolves to a record of fake data.
   */
  private async generateRow(fields: Record<string, FieldType>) {
    const row: Record<string, unknown> = {};

    for (const [key, def] of Object.entries(fields)) {
      if (def === "pk") continue;

      if (typeof def === "string" && def.startsWith("fk:")) {
        const target = def.split(":")[1];

        if (!target) {
          throw new Error(`Invalid FK definition: ${def}`);
        }

        const [targetTable, targetCol] = target.split(".");

        if (!targetTable || !targetCol) {
          throw new Error(`Invalid FK definition: ${def}`);
        }

        const result = await this.db
          .selectFrom(targetTable)
          .select(targetCol)
          .orderBy(this.db.fn("RANDOM", []))
          .limit(1)
          .executeTakeFirst();

        row[key] = result ? result[targetCol] : null;
        continue;
      }

      let value = this.resolveValue(def);

      if (typeof value === "boolean") {
        value = value ? 1 : 0;
      }

      row[key] = value;
    }

    return row;
  }

  /**
   * Resolves the value for a specific field definition.
   * Handles Faker strings, Enums, and custom objects.
   *
   * @param def - The field definition.
   * @returns The resolved value (string, number, boolean, etc.).
   */
  private resolveValue(def: FieldType): unknown {
    if (typeof def === "string") {
      if (def.startsWith("faker.")) {
        return this.executeFakerPath(def);
      }
      return def;
    }

    if (typeof def === "object") {
      if (def.type === "enum" && def.values) {
        return faker.helpers.arrayElement(def.values);
      }
      if (def.type && def.type.startsWith("faker.")) {
        return this.executeFakerPath(def.type, def.options);
      }
    }

    return null;
  }

  /**
   * Executes a Faker method specified by a string path (e.g., "faker.person.fullName").
   *
   * @param pathStr - The dot-notation path to the Faker method.
   * @param options - Optional options to pass to the Faker method.
   * @returns The generated fake value.
   */
  private executeFakerPath(pathStr: string, options?: Record<string, unknown>) {
    const path = pathStr.replace("faker.", "").split(".");
    let generator: any = faker;

    for (const p of path) {
      generator = generator[p];
    }

    if (typeof generator === "function") {
      return options !== undefined ? generator(options) : generator();
    }
    return null;
  }
}
