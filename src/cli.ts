import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

import { buildSignedTransactionHex } from './buildTx';
import { AppError } from './errors';
import { paramsSchema } from './schema';

interface CliArgs {
  paramsPath: string;
  wifEnvName?: string;
}

function parseArgs(argv: string[]): CliArgs {
  if (argv.length < 3) {
    throw new AppError(
      'ERR_INVALID_JSON',
      'Usage: node dist/cli.js <params.json> [--wif-env BTC_WIF]'
    );
  }

  const paramsPath = argv[2];
  const wifEnvName = argv.slice(3).reduce<string | undefined>((currentEnvName, arg, index, restArgs) => {
    if (restArgs[index - 1] === '--wif-env') {
      return currentEnvName;
    }

    if (arg === '--wif-env') {
      const envName = restArgs[index + 1];
      if (!envName) {
        throw new AppError('ERR_INVALID_JSON', '--wif-env requires an environment variable name');
      }
      return envName;
    }

    throw new AppError('ERR_INVALID_JSON', `Unknown argument: ${arg}`);
  }, undefined);

  return { paramsPath, wifEnvName };
}

function readJsonFile(filePath: string): unknown {
  try {
    const absolutePath = path.resolve(filePath);
    const content = fs.readFileSync(absolutePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new AppError('ERR_INVALID_JSON', `Failed to read/parse JSON: ${(error as Error).message}`);
  }
}

function resolveWif(parsed: { wif?: string }, wifEnvName?: string): string {
  const envCandidates = wifEnvName ? [wifEnvName] : ['BTC_WIF'];
  const envWif = envCandidates
    .map((name) => process.env[name]?.trim())
    .find((value) => Boolean(value));

  if (envWif) {
    return envWif;
  }

  if (parsed.wif) {
    return parsed.wif;
  }

  if (wifEnvName) {
    throw new AppError('ERR_INVALID_WIF', `Environment variable ${wifEnvName} is empty or missing`);
  }

  throw new AppError(
    'ERR_INVALID_WIF',
    'WIF is required: set BTC_WIF in .env/.env.example, use --wif-env, or provide wif in JSON'
  );
}

function loadDotEnv(): void {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

function main(): void {
  loadDotEnv();
  const args = parseArgs(process.argv);
  const raw = readJsonFile(args.paramsPath);
  const parsed = paramsSchema.parse(raw);

  const wif = resolveWif(parsed, args.wifEnvName);
  const txHex = buildSignedTransactionHex(parsed, { wif });
  process.stdout.write(`${txHex}\n`);
}

try {
  main();
} catch (error) {
  if (error instanceof AppError) {
    process.stderr.write(`[${error.code}] ${error.message}\n`);
    process.exit(1);
  }

  if ((error as { name?: string }).name === 'ZodError') {
    process.stderr.write(`[ERR_INVALID_JSON] ${(error as Error).message}\n`);
    process.exit(1);
  }

  process.stderr.write(`[ERR_SIGNING_FAILED] ${(error as Error).message}\n`);
  process.exit(1);
}
