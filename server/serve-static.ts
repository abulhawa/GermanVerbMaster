import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function serveStatic(app: Express) {
  const candidateDirs = [
    path.resolve(process.cwd(), "dist/public"),
    path.resolve(__dirname, "../public"),
    path.resolve(__dirname, "public"),
  ];

  const distPath = candidateDirs.find((candidate) => fs.existsSync(candidate));

  if (!distPath) {
    const formattedCandidates = candidateDirs
      .filter((candidate, index, self) => self.indexOf(candidate) === index)
      .map((candidate) => ` - ${candidate}`)
      .join("\n");

    throw new Error(
      `Could not find the client build directory. Looked for:\n${formattedCandidates}\nMake sure to run \`npm run build\` before starting the server.`,
    );
  }

  app.use(express.static(distPath));

  app.use((_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
