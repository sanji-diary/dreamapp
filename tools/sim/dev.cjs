// Starts the local server on the database the one-week walk-through left in .data/sim-week,
// so its result can be looked at in the real screens. Stop the ordinary `npm run dev` first.
//   node tools/sim/dev.cjs
const { spawn } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const env = { ...process.env, PGLITE_DIR: path.join(root, ".data", "sim-week"), DREAM_SEED: "off" };
const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [next, "dev"], { cwd: root, env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
