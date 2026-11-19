#!/usr/bin/env node
// `npm run demo`: the mock Abstractive server plus the app, wired together. Ctrl+C stops both.
import { spawn } from "node:child_process";

const env = { ...process.env, VITE_ABSTRACTIVE_ISS: "http://localhost:9090/fhir/r4" };
const children = [
  spawn(process.execPath, ["e2e/mock-abstractive.mjs"], { stdio: "inherit", env }),
  spawn("npx", ["vite", "--port", "5173", "--strictPort"], { stdio: "inherit", env }),
];
const stop = () => children.forEach((child) => child.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((child) => child.on("exit", stop));
