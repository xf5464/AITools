import { AppServerClient } from "../src/main/appServer/AppServerClient";
import { writeFileSync } from "node:fs";

async function main() {
  const client = new AppServerClient();
  try {
    await client.start();
    const result = JSON.stringify({ state: client.process.state, executablePath: client.process.executablePath, error: client.process.error ?? null });
    console.log(result);
    if (process.argv[2]) writeFileSync(process.argv[2], result, "utf8");
    if (client.process.state !== "ready") process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.stop();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
