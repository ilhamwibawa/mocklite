import { cac } from "cac";
import pc from "picocolors";
import { version } from "../../package.json";
import { initCommand } from "./commands/init";
import { devCommand } from "./commands/dev";

const cli = cac("mocklite");

// Define the 'init' command
cli
  .command("init", "Initialize a new mocklite config")
  .action(async () => await initCommand());

// Define the 'dev' command
cli
  .command("dev", "Start the mock server in development mode")
  .option("--port <port>", "Port to listen on", { default: 3000 })
  .option("--schema <path>", "Path to custom config file")
  .action(async (options) => {
    await devCommand(options);
  });

// Define the 'start' command (Production-like alias)
cli
  .command("start", "Start the mock server")
  .option("--port <port>", "Port to listen on", { default: 3000 })
  .option("--schema <path>", "Path to custom config file")
  .action(async (options) => {
    await devCommand(options);
  });

cli.help();
cli.version(version);

export { cli };
