import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { AppServerClient } from "./appServer/AppServerClient";
import { ProtocolAdapter } from "./appServer/ProtocolAdapter";
import { GitService } from "./git/GitService";
import { ApplicationController, registerHandlers } from "./ipc/handlers";
import { Database } from "./persistence/Database";
import { ReviewRequirementsService } from "./requirements/ReviewRequirementsService";
import { ReviewService } from "./reviews/ReviewService";
import { SessionRegistry } from "./sessions/SessionRegistry";
import { TokenService } from "./tokens/TokenService";

let mainWindow: BrowserWindow | undefined;
let database: Database | undefined;
let appServer: AppServerClient | undefined;

async function createWindow() {
  mainWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 1024, minHeight: 720, title: "Codex Review Manager", backgroundColor: "#f5f7fb", webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.maximize();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  if (process.env.VITE_DEV_SERVER_URL) await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL); else await mainWindow.loadFile(join(__dirname, "../dist/renderer/index.html"));
}

app.whenReady().then(async () => {
  database = new Database(join(app.getPath("userData"), "review-manager.db"));
  const git = new GitService();
  appServer = new AppServerClient();
  const protocol = new ProtocolAdapter();
  const requirements = new ReviewRequirementsService(database);
  const tokens = new TokenService(database, appServer);
  const sessions = new SessionRegistry(database, appServer, protocol);
  const reviews = new ReviewService(database, git, requirements, sessions, appServer, protocol, tokens, database.getSetting<number>("globalConcurrency") ?? 1);
  const controller = new ApplicationController(database, git, requirements, reviews, tokens, appServer);
  registerHandlers(controller);
  await createWindow();
  appServer.start().catch(() => undefined).then(() => controller.initialize()).catch(() => controller.broadcast());
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { void appServer?.stop(); database?.close(); });
