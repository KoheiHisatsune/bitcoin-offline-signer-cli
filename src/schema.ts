import { z } from 'zod';

const hexRegex = /^[0-9a-fA-F]+$/;

const satoshiNumber = z
  .number({ invalid_type_error: 'must be a number' })
  .int('must be an integer')
  .nonnegative('must be >= 0')
  .max(Number.MAX_SAFE_INTEGER, 'must be <= Number.MAX_SAFE_INTEGER');

export const inputSchema = z.object({
  txid: z
    .string()
    .length(64, 'txid must be 64 hex chars')
    .regex(hexRegex, 'txid must be hex'),
  vout: z.number().int().nonnegative(),
  value_sats: satoshiNumber.positive('value_sats must be > 0'),
  script_pubkey: z
    .string()
    .min(4)
    .regex(hexRegex, 'script_pubkey must be hex')
    .refine((v) => v.length % 2 === 0, 'script_pubkey must have even-length hex')
    .transform((v) => v.toLowerCase())
});

export const outputSchema = z.object({
  address: z.string().min(1),
  value_sats: satoshiNumber.positive('value_sats must be > 0')
});

export const paramsSchema = z.object({
  network: z.enum(['testnet', 'mainnet']),
  wif: z.string().min(1).optional(),
  inputs: z.array(inputSchema).min(1),
  outputs: z.array(outputSchema).min(1),
  change_address: z.string().min(1),
  fee_sats: satoshiNumber.positive('fee_sats must be > 0')
});

export type TxParams = z.infer<typeof paramsSchema>;
