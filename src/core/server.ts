import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { Kysely, type SelectQueryBuilder } from "kysely";
import pc from "picocolors";
import type { MockliteConfig } from "./types";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import { version } from "../../package.json";
import Table from "cli-table3";
import { Seeder } from "./seeder";

/**
 * The main Mocklite server class.
 * Handles API route generation, server lifecycle, and request handling.
 */
export class MockServer {
  private app: Hono;

  /**
   * Initializes a new instance of the MockServer class.
   * Sets up the Hono app, middleware (logging, CORS, network simulation), and routes.
   *
   * @param db - The Kysely database instance.
   * @param config - The Mocklite configuration object.
   */
  constructor(private db: Kysely<any>, private config: MockliteConfig) {
    this.app = new Hono();

    this.app.use("*", async (c, next) => {
      const start = Date.now();
      const method = c.req.method;
      const url = c.req.url;

      await next();

      const end = Date.now();
      const status = c.res.status;
      const duration = `${end - start}ms`;

      const statusColor =
        status >= 500
          ? pc.red
          : status >= 400
          ? pc.yellow
          : status >= 300
          ? pc.cyan
          : pc.green;

      console.log(
        `  ${pc.bold(method.padEnd(6))} ` +
          `${url.padEnd(30)} ` +
          `${statusColor(status)} ` +
          `${pc.dim(duration)}`
      );
    });

    this.app.use("*", cors());

    // Network Simulation Middleware
    this.app.use("*", async (c, next) => {
      // 1. Chaos Mode (Global Error Rate)
      if (this.config.errorRate) {
        if (Math.random() < this.config.errorRate) {
          throw new Error("Chaos Monkey struck! Request failed intentionally.");
        }
      }

      // 2. Global Delay (Network Throttling)
      if (this.config.delay) {
        await new Promise((resolve) => setTimeout(resolve, this.config.delay));
      }

      await next();
    });

    // Global Error Handler
    this.app.onError((err, c) => {
      const status = 500;
      return c.json({ error: err.message || "Internal Server Error" }, status);
    });

    this.generateRoutes();
  }

  /**
   * Transforms database results to match the desired output format.
   * Specifically handles boolean conversion from 0/1 to true/false.
   *
   * @param tableName - The name of the table the data belongs to.
   * @param data - The data returned from the database.
   * @returns The transformed data.
   */
  private transformResult<T>(tableName: string, data: T | T[]) {
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

  /**
   * Generates API routes for all tables defined in the configuration.
   * Creates GET (list & detail), POST, PUT, and DELETE endpoints.
   */
  private generateRoutes() {
    this.app.get("/", (c) =>
      c.json({
        message: "MockLite is running!",
        endpoints: this.config.schema.map((t) => `/${t.table}`),
      })
    );

    for (const table of this.config.schema) {
      const tableName = table.table;

      this.app.get(`/${tableName}`, async (c) => {
        const queryParams = c.req.query();
        const { include, page, limit, ...filters } = queryParams;

        const includeParam = include;
        const pageNum = Number(page) || 1;
        const limitNum = Number(limit) || 10;
        const offset = (pageNum - 1) * limitNum;

        let countQuery = this.db
          .selectFrom(tableName)
          .select((eb: any) => eb.fn.countAll().as("total"));

        let dataQuery = this.db.selectFrom(tableName).selectAll();

        // APPLY FILTERS
        for (const [key, value] of Object.entries(filters)) {
          const fieldDef = table.fields[key];
          const isId = key === "id";

          if ((fieldDef || isId) && value !== undefined) {
            let op = "=";
            let val: unknown = value;

            if (!isId) {
              const isString =
                typeof fieldDef === "string" &&
                !fieldDef.includes("boolean") &&
                !fieldDef.includes("number") &&
                !fieldDef.includes("int");

              if (isString) {
                op = "like";
                val = `%${value}%`;
              }
            }

            countQuery = countQuery.where(key, op as any, val);
            dataQuery = dataQuery.where(key, op as any, val);
          }
        }

        const countResult = await countQuery.executeTakeFirst();
        const total = Number((countResult as any)?.total || 0);

        // RELATIONAL LOGIC HANDLING
        if (includeParam) {
          dataQuery = this.applyRelation(
            dataQuery,
            tableName,
            includeParam as string
          );
        }

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

      this.app.get(`/${tableName}/:id`, async (c) => {
        const id = c.req.param("id");
        const includeParam = c.req.query("include");

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
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          return c.json({ error: errorMessage }, 400);
        }
      });

      this.app.put(`/${tableName}/:id`, async (c) => {
        const id = c.req.param("id");
        const body = await c.req.json();

        try {
          const result = await this.db
            .updateTable(tableName)
            .set(body)
            .where("id", "=", id)
            .executeTakeFirst();

          if (Number(result.numUpdatedRows) === 0) {
            return c.json({ error: "Not Found" }, 404);
          }

          return c.json(
            this.transformResult(tableName, {
              id,
              ...body,
            })
          );
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          return c.json({ error: errorMessage }, 400);
        }
      });

      this.app.delete(`/${tableName}/:id`, async (c) => {
        const id = c.req.param("id");

        try {
          const result = await this.db
            .deleteFrom(tableName)
            .where("id", "=", id)
            .executeTakeFirst();

          if (Number(result.numDeletedRows) === 0) {
            return c.json({ error: "Not Found" }, 404);
          }

          return c.json({ message: "Deleted successfully" });
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          return c.json({ error: errorMessage }, 400);
        }
      });
    }
  }

  /**
   * Applies relationship joins (BelongsTo or HasMany) to the query based on the 'include' parameter.
   *
   * @param query - The current Kysely query builder.
   * @param currentTable - The name of the current table being queried.
   * @param targetParam - The 'include' parameter value (target resource).
   * @returns The updated query builder with the relationship included.
   */
  private applyRelation(
    query: SelectQueryBuilder<
      any,
      string,
      {
        [x: string]: any;
      }
    >,
    currentTable: string,
    targetParam: string
  ) {
    const getColumns = (tableName: string) => {
      const tableDef = this.config.schema.find((t) => t.table === tableName);
      return tableDef ? Object.keys(tableDef.fields) : [];
    };

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

            const columns = getColumns(targetParam);

            return query.select((eb: any) => [
              jsonArrayFrom(
                eb
                  .selectFrom(targetParam)
                  .select(columns)
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

  /**
   * Starts the HTTP server on the specified port.
   * Also sets up interactive CLI mode.
   *
   * @param port - The port number to listen on.
   */
  start(port: number) {
    serve({
      fetch: this.app.fetch,
      port: port,
    });

    this.printBanner(port);
    this.setupInteractiveMode(port);
  }

  /**
   * Prints the startup banner and server status to the console.
   *
   * @param port - The port number the server is running on.
   */
  private printBanner(port: number) {
    console.clear();

    console.log(
      pc.bold(
        pc.bgBlue(pc.white("MOCKLITE ")) +
          "v" +
          pc.bold(pc.bgBlue(pc.white(version)))
      )
    );
    console.log(pc.dim(`Server running at http://localhost:${port}`));

    // Network Status
    if (this.config.delay || this.config.errorRate) {
      const status = [];
      if (this.config.delay) status.push(`Delay: ${this.config.delay}ms`);
      if (this.config.errorRate)
        status.push(`Chaos: ${this.config.errorRate * 100}%`);
      console.log(pc.yellow(`⚠️  Network Simulation: ${status.join(", ")}`));
    }

    // Bikin Tabel Endpoint
    const table = new Table({
      head: [pc.cyan("Method"), pc.cyan("Endpoint"), pc.cyan("Features")],
      style: { head: [], border: [] }, // Minimalist style
    });

    // Loop config untuk isi tabel
    this.config.schema.forEach((t) => {
      const relations = Object.values(t.fields).filter(
        (f) => typeof f === "string" && f.startsWith("fk:")
      ).length;

      const features = [];
      if (t.seed) features.push(`Seed: ${t.seed}`);
      if (relations > 0) features.push(`Rel: ${relations}`);

      // Push row ke tabel
      table.push(
        ["GET, POST", `/${t.table}`, pc.dim(features.join(", "))],
        [pc.dim("GET, PUT, DEL"), pc.dim(`/${t.table}/:id`), ""]
      );
    });

    console.log(table.toString());
    console.log(pc.dim("\nShortcuts:"));
    console.log(
      `  ${pc.bold("s")} ${pc.dim("seed")}   ` +
        `  ${pc.bold("c")} ${pc.dim("clear")}   ` +
        `  ${pc.bold("q")} ${pc.dim("quit")}`
    );
    console.log(pc.dim("--------------------------------------------------"));
  }

  /**
   * Sets up interactive CLI mode for controlling the server (re-seed, clear, quit).
   *
   * @param port - The port number (used for re-printing the banner).
   */
  private setupInteractiveMode(port: number) {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");

      process.stdin.on("data", async (key: Buffer | string) => {
        const char = key.toString();

        // q or Ctrl+C to quit
        if (char === "q" || char === "\u0003") {
          console.log(pc.yellow("\nShutting down..."));
          process.exit(0);
        }

        // c to clear
        if (char === "c") {
          this.printBanner(port);
        }

        // s to re-seed
        if (char === "s") {
          console.log(pc.cyan("\n🔄 Re-seeding database..."));
          const seeder = new Seeder(this.db);
          await seeder.clear(this.config);
          await seeder.run(this.config);
          console.log(
            pc.dim("--------------------------------------------------")
          );
        }
      });
    }
  }
}
