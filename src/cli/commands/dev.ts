import { loadConfig } from "../../core/config";
import { MockDatabase } from "../../core/db";
import { Seeder } from "../../core/seeder";
import { MockServer } from "../../core/server";
import pc from "picocolors";

export async function devCommand(options: { port: number }) {
  console.log(pc.cyan(`🚀 Starting MockLite Dev Server...`));

  const config = await loadConfig();
  if (!config) return;

  const dbEngine = new MockDatabase();
  try {
    await dbEngine.setup(config);

    const seeder = new Seeder(dbEngine.getInstance());
    await seeder.run(config);

    const server = new MockServer(dbEngine.getInstance(), config);
    server.start(options.port);
  } catch (err) {
    console.error(pc.red("❌ Error:"));
    console.error(err);
    process.exit(1);
  }
}
