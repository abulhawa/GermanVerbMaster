import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type VercelBuildStep = 'seed' | 'build:tasks' | 'build';

export function isProductionVercelDeployment(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (env.VERCEL_ENV ?? '').trim().toLowerCase() === 'production';
}

export function getVercelBuildSteps(
  env: NodeJS.ProcessEnv = process.env,
): VercelBuildStep[] {
  if (isProductionVercelDeployment(env)) {
    return ['seed', 'build:tasks', 'build'];
  }

  return ['build'];
}

function runNpmScript(scriptName: VercelBuildStep): Promise<void> {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = npmExecPath ? [npmExecPath, 'run', scriptName] : ['run', scriptName];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (signal) {
        reject(new Error(`npm run ${scriptName} terminated with signal ${signal}`));
        return;
      }

      reject(new Error(`npm run ${scriptName} failed with exit code ${code ?? 'unknown'}`));
    });
  });
}

export async function runVercelBuild(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const buildSteps = getVercelBuildSteps(env);

  if (isProductionVercelDeployment(env)) {
    console.log(
      '[vercel-build] Production deployment detected; refreshing seeded content before building.',
    );
  } else {
    console.log(
      '[vercel-build] Non-production deployment detected; skipping seed and task rebuild.',
    );
  }

  for (const step of buildSteps) {
    console.log(`[vercel-build] Running npm run ${step}`);
    await runNpmScript(step);
  }
}

const scriptPath = fileURLToPath(import.meta.url);
const invokedPath = path.resolve(process.argv[1] ?? '');

if (scriptPath === invokedPath) {
  runVercelBuild().catch((error) => {
    console.error('Failed to complete Vercel build preparation:', error);
    process.exit(1);
  });
}
