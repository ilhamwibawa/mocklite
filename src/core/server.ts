import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { Kysely } from "kysely";
import pc from "picocolors";
import type { MockliteConfig } from "./types";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";

export class MockServer {
  private app: Hono;

  constructor(private db: Kysely<any>, private config: MockliteConfig) {
    this.app = new Hono();

    this.app.use("*", cors());
    this.app.use("*", logger());

    this.generateRoutes();
  }

  private transformResult(tableName: string, data: any | any[]) {
    const tableDef = this.config.schema.find((t) => t.table === tableName);
    if (!tableDef) return data;

    const booleanFields = Object.entries(tableDef.fields)
      .filter(([_, def]) => {
        // Check for string config "faker.datatype.boolean"
        if (typeof def === "string" && def.includes("boolean")) return true;
        // Check for object config { type: "boolean" } (future-proofing)
        if (typeof def === "object" && def.type && def.type.includes("boolean"))
          return true;
        return false;
      })
      .map(([key]) => key);

    if (booleanFields.length === 0) return data;

    const transformItem = (item: any) => {
      if (!item) return item;
      const newItem = { ...item };

      for (const field of booleanFields) {
        if (newItem[field] !== undefined) {
          newItem[field] = Number(newItem[field]) === 1;
        }
      }
      return newItem;
    };

    if (Array.isArray(data)) {
      return data.map(transformItem);
    }
    return transformItem(data);
  }

  private generateRoutes() {
    this.app.get("/", (c) =>
      c.json({
        message: "MockLite is running!",
        endpoints: this.config.schema.map((t) => `/${t.table}`),
      })
    );

    for (const table of this.config.schema) {
      const tableName = table.table;

      // 1. GET List endpoint
      this.app.get(`/${tableName}`, async (c) => {
        const includeParam = c.req.query("include"); // Retrieve query parameter ?include=...
        let query = this.db.selectFrom(tableName).selectAll();

        // RELATIONAL LOGIC HANDLING
        if (includeParam) {
          query = this.applyRelation(query, tableName, includeParam);
        }

        const data = await query.execute();
        return c.json(this.transformResult(tableName, data));
      });

      // 2. GET Detail endpoint
      this.app.get(`/${tableName}/:id`, async (c) => {
        const id = c.req.param("id");
        const includeParam = c.req.query("include"); // Support include parameter in detail view

        let query = this.db
          .selectFrom(tableName)
          .selectAll()
          .where("id", "=", id);

        if (includeParam) {
          query = this.applyRelation(query, tableName, includeParam);
        }

        const data = await query.executeTakeFirst();
        if (!data) return c.json({ error: "Not Found" }, 404);
        return c.json(this.transformResult(tableName, data));
      });

      // 3. POST Create endpoint
      this.app.post(`/${tableName}`, async (c) => {
        const body = await c.req.json();

        try {
          const result = await this.db
            .insertInto(tableName)
            .values(body)
            .executeTakeFirst();

          return c.json(
            this.transformResult(tableName, {
              id: result.insertId?.toString(),
              ...body,
            }),
            201
          );
        } catch (error: any) {
          return c.json({ error: error.message }, 400);
        }
      });
    }
  }

  private applyRelation(query: any, currentTable: string, targetParam: string) {
    // Helper to retrieve the list of columns from the schema configuration
    const getColumns = (tableName: string) => {
      const tableDef = this.config.schema.find((t) => t.table === tableName);
      return tableDef ? Object.keys(tableDef.fields) : [];
    };

    // CASE A: Belongs To relationship (e.g., posts -> include users/author)
    const currentTableConfig = this.config.schema.find(
      (t) => t.table === currentTable
    );

    if (currentTableConfig) {
      for (const [field, def] of Object.entries(currentTableConfig.fields)) {
        if (typeof def === "string" && def.startsWith("fk:")) {
          const targetTable = def.split(":")[1]?.split(".")[0];
          const fieldBaseName = field.replace("Id", "");

          if (targetParam === targetTable || targetParam === fieldBaseName) {
            console.log(
              pc.dim(
                `   🔗 Linking ${currentTable} -> ${targetTable} (BelongsTo)`
              )
            );

            if (!targetTable) {
              throw new Error(`Invalid FK definition: ${def}`);
            }

            // Explicitly select target columns
            const columns = getColumns(targetTable);

            return query.select((eb: any) => [
              jsonObjectFrom(
                eb
                  .selectFrom(targetTable)
                  .select(columns) // Select specific column array
                  .whereRef(
                    `${targetTable}.id`,
                    "=",
                    `${currentTable}.${field}`
                  )
              ).as(targetParam),
            ]);
          }
        }
      }
    }

    // CASE B: Has Many relationship (e.g., users -> include posts)
    const targetTableConfig = this.config.schema.find(
      (t) => t.table === targetParam
    );
    if (targetTableConfig) {
      for (const [field, def] of Object.entries(targetTableConfig.fields)) {
        if (typeof def === "string" && def.startsWith("fk:")) {
          const pointedTable = def.split(":")[1]?.split(".")[0];

          if (pointedTable === currentTable) {
            console.log(
              pc.dim(
                `   🔗 Linking ${currentTable} -> ${targetParam} (HasMany)`
              )
            );

            // Explicitly select target columns
            const columns = getColumns(targetParam);

            return query.select((eb: any) => [
              jsonArrayFrom(
                eb
                  .selectFrom(targetParam)
                  .select(columns) // Select specific column array
                  .whereRef(
                    `${targetParam}.${field}`,
                    "=",
                    `${currentTable}.id`
                  )
              ).as(targetParam),
            ]);
          }
        }
      }
    }

    return query;
  }

  start(port: number) {
    serve({
      fetch: this.app.fetch,
      port: port,
    });
    console.log(pc.green(`\n🚀 Server running at http://localhost:${port}`));
    console.log(pc.cyan(`   Try: http://localhost:${port}/users`));
  }
}
