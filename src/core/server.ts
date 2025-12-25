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
      // 1. GET List endpoint
      this.app.get(`/${tableName}`, async (c) => {
        const queryParams = c.req.query();
        const { include, page, limit, ...filters } = queryParams;

        const includeParam = include;
        const pageNum = Number(page) || 1;
        const limitNum = Number(limit) || 10;
        const offset = (pageNum - 1) * limitNum;

        // Base query for counting
        let countQuery = this.db
          .selectFrom(tableName)
          .select((eb: any) => eb.fn.countAll().as("total"));

        // Base query for data
        let dataQuery = this.db.selectFrom(tableName).selectAll();

        // APPLY FILTERS
        // APPLY FILTERS
        for (const [key, value] of Object.entries(filters)) {
          // Check if field exists in schema to prevent SQL injection or errors
          const fieldDef = table.fields[key];
          const isId = key === "id";

          if ((fieldDef || isId) && value !== undefined) {
            let op = "=";
            let val: any = value;

            // Logic to determine if we should use LIKE (Partial Match)
            if (!isId) {
              // If it's a string config that doesn't explicitly look like a boolean/number
              // OR if it's an object config without 'boolean'/'number' type
              const isString =
                typeof fieldDef === "string" &&
                !fieldDef.includes("boolean") &&
                !fieldDef.includes("number") &&
                !fieldDef.includes("int");

              // You can expand this logic based on your types
              if (isString) {
                op = "like";
                val = `%${value}%`;
              }
            }

            countQuery = countQuery.where(key, op as any, val);
            dataQuery = dataQuery.where(key, op as any, val);
          }
        }

        // 1. Get total count
        const countResult = await countQuery.executeTakeFirst();
        const total = Number((countResult as any)?.total || 0);

        // 2. Prepare query for data

        // RELATIONAL LOGIC HANDLING
        if (includeParam) {
          dataQuery = this.applyRelation(
            dataQuery,
            tableName,
            includeParam as string
          );
        }

        // Apply pagination
        dataQuery = dataQuery.limit(limitNum).offset(offset);

        const data = await dataQuery.execute();

        return c.json({
          data: this.transformResult(tableName, data),
          meta: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
          },
        });
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
