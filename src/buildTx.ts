import * as bitcoin from 'bitcoinjs-lib';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';

import { AppError } from './errors';
import type { TxParams } from './schema';

const ECPair = ECPairFactory(ecc);
bitcoin.initEccLib(ecc);
const DUST_P2WPKH_SATS = 294;

export interface BuildOptions {
  wif: string;
}

function resolveNetwork(network: TxParams['network']): bitcoin.Network {
  if (network === 'testnet') {
    return bitcoin.networks.testnet;
  }
  if (network === 'mainnet') {
    return bitcoin.networks.bitcoin;
  }
  throw new AppError('ERR_INVALID_NETWORK', `Unsupported network: ${network}`);
}

export function buildSignedTransactionHex(params: TxParams, options: BuildOptions): string {
  const network = resolveNetwork(params.network);

  let keyPair;
  try {
    keyPair = ECPair.fromWIF(options.wif, network);
  } catch (error) {
    throw new AppError('ERR_INVALID_WIF', `Failed to parse WIF: ${(error as Error).message}`);
  }

  if (!keyPair.publicKey || keyPair.publicKey.length !== 33) {
    throw new AppError('ERR_INVALID_WIF', 'WIF did not produce a compressed public key');
  }

  const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(keyPair.publicKey), network });
  if (!p2wpkh.output) {
    throw new AppError('ERR_SIGNING_FAILED', 'Failed to build P2WPKH output script from WIF');
  }
  const expectedScriptPubkeyHex = p2wpkh.output.toString('hex');

  const totalInput = params.inputs.reduce((sum, input) => sum + input.value_sats, 0);
  const totalOutput = params.outputs.reduce((sum, output) => sum + output.value_sats, 0);

  if (params.fee_sats > totalInput * 0.5) {
    throw new AppError(
      'ERR_FEE_TOO_HIGH',
      `fee_sats=${params.fee_sats} is too high for total_input=${totalInput} (>50%)`
    );
  }

  const change = totalInput - totalOutput - params.fee_sats;
  if (change < 0) {
    throw new AppError(
      'ERR_INSUFFICIENT_FUNDS',
      `Insufficient funds: inputs=${totalInput}, outputs=${totalOutput}, fee=${params.fee_sats}`
    );
  }
  if (change > 0 && change < DUST_P2WPKH_SATS) {
    throw new AppError(
      'ERR_DUST_CHANGE',
      `Change (${change}) is below dust threshold ${DUST_P2WPKH_SATS} sats`
    );
  }

  const psbt = new bitcoin.Psbt({ network });

  for (const [index, input] of params.inputs.entries()) {
    const inputScriptHex = input.script_pubkey.toLowerCase();

    // P2WPKH script must be 0x00 PUSH_DATA_20 <20-byte-pubkey-hash> => 22 bytes => 44 hex chars.
    if (!inputScriptHex.startsWith('0014') || inputScriptHex.length !== 44) {
      throw new AppError(
        'ERR_UNSUPPORTED_SCRIPT_TYPE',
        `Input ${index}: only P2WPKH script_pubkey is supported`
      );
    }

    if (inputScriptHex !== expectedScriptPubkeyHex) {
      throw new AppError(
        'ERR_SCRIPT_MISMATCH',
        `Input ${index}: script_pubkey does not match WIF-derived P2WPKH script`
      );
    }

    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: Buffer.from(input.script_pubkey, 'hex'),
        value: input.value_sats
      }
    });
  }

  for (const output of params.outputs) {
    psbt.addOutput({
      address: output.address,
      value: output.value_sats
    });
  }

  if (change >= DUST_P2WPKH_SATS) {
    psbt.addOutput({
      address: params.change_address,
      value: change
    });
  }

  try {
    for (let i = 0; i < params.inputs.length; i += 1) {
      psbt.signInput(i, keyPair);
      const isValid = psbt.validateSignaturesOfInput(i, (pubkey, msghash, signature) => {
        return ecc.verify(msghash, pubkey, signature);
      });
      if (!isValid) {
        throw new AppError('ERR_SIGNING_FAILED', `Invalid signature at input index ${i}`);
      }
    }
    psbt.finalizeAllInputs();
  } catch (error) {
    throw new AppError('ERR_SIGNING_FAILED', `Signing/finalization failed: ${(error as Error).message}`);
  }

  return psbt.extractTransaction().toHex();
}
