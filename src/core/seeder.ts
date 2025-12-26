import { Kysely } from "kysely";
import { faker } from "@faker-js/faker";
import pc from "picocolors";
import type { MockliteConfig, FieldType } from "./types";

export class Seeder {
  constructor(private db: Kysely<any>) {}

  async clear(config: MockliteConfig) {
    // Kita hapus data dari tabel anak dulu (posts) baru induk (users)
    // Tapi karena ada ON DELETE CASCADE, hapus induk saja cukup.
    // Namun biar aman, kita loop semua.
    for (const table of config.schema) {
      try {
        await this.db.deleteFrom(table.table).execute();
      } catch (e) {
        // Ignore error (misal tabel belum ada)
      }
    }
  }

  async run(config: MockliteConfig) {
    console.log(pc.cyan("🌱 Seeding database..."));

    // Loop through each table in the configuration
    for (const table of config.schema) {
      const count = table.seed || 0;
      if (count === 0) continue;

      const rows: Record<string, unknown>[] = [];
      console.log(pc.dim(`   Generaring ${count} rows for ${table.table}...`));

      for (let i = 0; i < count; i++) {
        const row = await this.generateRow(table.fields);
        rows.push(row);
      }

      // Insert into the database
      if (rows.length > 0) {
        await this.db.insertInto(table.table).values(rows).execute();
      }
    }

    console.log(pc.green("✨ Seeding complete!"));
  }

  private async generateRow(fields: Record<string, FieldType>) {
    const row: Record<string, unknown> = {};

    for (const [key, def] of Object.entries(fields)) {
      // 1. Skip Primary Key (Auto Increment)
      if (def === "pk") continue;

      // 2. Handle Foreign Key relationships
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

      // 3. Handle Faker generators and static values
      let value = this.resolveValue(def);

      if (typeof value === "boolean") {
        value = value ? 1 : 0;
      }

      row[key] = value;
    }

    return row;
  }

  private resolveValue(def: FieldType): unknown {
    // Case A: String Configuration (e.g., "faker.person.fullName")
    if (typeof def === "string") {
      if (def.startsWith("faker.")) {
        return this.executeFakerPath(def);
      }
      return def; // Literal string
    }

    // Case B: Object Configuration
    if (typeof def === "object") {
      // Enum selection
      if (def.type === "enum" && def.values) {
        return faker.helpers.arrayElement(def.values);
      }
      // Faker generator with options
      if (def.type && def.type.startsWith("faker.")) {
        return this.executeFakerPath(def.type, def.options);
      }
    }

    return null;
  }

  // Helper to convert string path "faker.person.name" into a function call
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
