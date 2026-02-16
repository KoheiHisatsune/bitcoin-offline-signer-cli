import * as fs from 'node:fs';
import * as path from 'node:path';

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
  let wifEnvName: string | undefined;

  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--wif-env') {
      const envName = argv[i + 1];
      if (!envName) {
        throw new AppError('ERR_INVALID_JSON', '--wif-env requires an environment variable name');
      }
      wifEnvName = envName;
      i += 1;
      continue;
    }

    throw new AppError('ERR_INVALID_JSON', `Unknown argument: ${arg}`);
  }

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
  if (wifEnvName) {
    const fromEnv = process.env[wifEnvName];
    if (!fromEnv) {
      throw new AppError('ERR_INVALID_WIF', `Environment variable ${wifEnvName} is empty or missing`);
    }
    return fromEnv;
  }

  if (!parsed.wif) {
    throw new AppError('ERR_INVALID_WIF', 'wif is required in JSON when --wif-env is not used');
  }

  return parsed.wif;
}

function main(): void {
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
