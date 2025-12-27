import fs from "fs-extra";
import path from "path";
import pc from "picocolors";
import type { MockliteConfig } from "./types";

/**
 * Loads the Mocklite configuration from a file.
 *
 * @param customPath - Optional custom path to the configuration file.
 * @returns A promise that resolves to the Mocklite configuration or null if not found/error.
 */
export async function loadConfig(
  customPath?: string
): Promise<MockliteConfig | null> {
  const configPath = customPath
    ? path.resolve(process.cwd(), customPath)
    : path.resolve(process.cwd(), "mocklite.config.json");

  if (!(await fs.pathExists(configPath))) {
    console.error(pc.red("❌ mocklite.config.json not found."));
    console.error(pc.yellow('   Run "mocklite init" first.'));
    return null;
  }

  try {
    const config = await fs.readJSON(configPath);
    return config as MockliteConfig;
  } catch (error) {
    console.error(pc.red("❌ Error reading config file:"));
    console.error(error);
    return null;
  }
}
