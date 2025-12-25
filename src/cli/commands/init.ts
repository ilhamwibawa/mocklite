import fs from "fs-extra";
import path from "path";
import pc from "picocolors";
import { DEFAULT_CONFIG } from "../../core/defaults";

export async function initCommand() {
  const fileName = "mocklite.config.json";
  const targetPath = path.resolve(process.cwd(), fileName);

  if (await fs.pathExists(targetPath)) {
    console.log(pc.yellow(`⚠️  ${fileName} already exists in this directory.`));
    console.log(pc.dim("   Skipping initialization to prevent overwrite."));
    return;
  }

  try {
    await fs.writeJSON(targetPath, DEFAULT_CONFIG, { spaces: 2 });

    console.log(pc.green(`✅ Success! Created ${fileName}`));
    console.log(pc.dim("   You can now edit the file to define your schema."));
    console.log();
    console.log(`   Run ${pc.cyan("mocklite dev")} to start the server.`);
  } catch (error) {
    console.error(pc.red("❌ Failed to create config file:"));
    console.error(error);
  }
}
