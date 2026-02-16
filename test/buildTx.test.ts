import * as bitcoin from 'bitcoinjs-lib';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { describe, expect, it } from 'vitest';

import { buildSignedTransactionHex } from '../src/buildTx';
import { AppError } from '../src/errors';
import type { TxParams } from '../src/schema';

const ECPair = ECPairFactory(ecc);

function makeFixture(network: bitcoin.Network = bitcoin.networks.testnet): TxParams & { wif: string } {
  const keyPair = ECPair.makeRandom({ network });
  const wif = keyPair.toWIF();
  const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(keyPair.publicKey), network });
  if (!p2wpkh.output || !p2wpkh.address) {
    throw new Error('failed to build fixture payment');
  }

  return {
    network: network === bitcoin.networks.bitcoin ? 'mainnet' : 'testnet',
    wif,
    inputs: [
      {
        txid: '1'.repeat(64),
        vout: 0,
        value_sats: 120000,
        script_pubkey: p2wpkh.output.toString('hex')
      }
    ],
    outputs: [
      {
        address: p2wpkh.address,
        value_sats: 100000
      }
    ],
    change_address: p2wpkh.address,
    fee_sats: 1000
  };
}

describe('buildSignedTransactionHex', () => {
  it('builds tx hex with change output', () => {
    const fx = makeFixture();
    const txHex = buildSignedTransactionHex(fx, { wif: fx.wif });

    const tx = bitcoin.Transaction.fromHex(txHex);
    expect(tx.outs.length).toBe(2);
    const values = tx.outs.map((o) => o.value).sort((a, b) => a - b);
    expect(values).toEqual([19000, 100000]);
  });

  it('builds tx hex without change when exact spend', () => {
    const fx = makeFixture();
    fx.outputs[0].value_sats = 119000;
    const txHex = buildSignedTransactionHex(fx, { wif: fx.wif });

    const tx = bitcoin.Transaction.fromHex(txHex);
    expect(tx.outs.length).toBe(1);
    expect(tx.outs[0].value).toBe(119000);
  });

  it('throws on insufficient funds', () => {
    const fx = makeFixture();
    fx.outputs[0].value_sats = 119500;
    fx.fee_sats = 1000;

    expect(() => buildSignedTransactionHex(fx, { wif: fx.wif })).toThrowError(AppError);
    expect(() => buildSignedTransactionHex(fx, { wif: fx.wif })).toThrow(/ERR_INSUFFICIENT_FUNDS|Insufficient funds/);
  });

  it('throws on dust change', () => {
    const fx = makeFixture();
    fx.outputs[0].value_sats = 119000;
    fx.fee_sats = 800;

    expect(() => buildSignedTransactionHex(fx, { wif: fx.wif })).toThrow(/DUST_CHANGE|dust/i);
  });

  it('throws when fee is too high', () => {
    const fx = makeFixture();
    fx.fee_sats = 70000;

    expect(() => buildSignedTransactionHex(fx, { wif: fx.wif })).toThrow(/FEE_TOO_HIGH|too high/);
  });

  it('throws when script does not match key', () => {
    const fx = makeFixture();
    fx.inputs[0].script_pubkey = '0014' + 'f'.repeat(40);

    expect(() => buildSignedTransactionHex(fx, { wif: fx.wif })).toThrow(/SCRIPT_MISMATCH|does not match/);
  });

  it('throws on unsupported network value', () => {
    const fx = makeFixture();
    const bad = { ...fx, network: 'testnet4' as unknown as TxParams['network'] };

    expect(() => buildSignedTransactionHex(bad, { wif: fx.wif })).toThrow(/INVALID_NETWORK|Unsupported network/);
  });

  it('throws on unsupported script type', () => {
    const fx = makeFixture();
    fx.inputs[0].script_pubkey = '76a914' + '1'.repeat(40) + '88ac';

    expect(() => buildSignedTransactionHex(fx, { wif: fx.wif })).toThrow(/UNSUPPORTED_SCRIPT_TYPE|supported/);
  });
});
