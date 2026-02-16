# Bitcoin Offline Signer CLI (TypeScript)

JSON入力から、ブロードキャスト可能な署名済みraw transaction hexを生成するCLIです。

## Features
- `bitcoinjs-lib` の `Psbt` を使用（`TransactionBuilder` 不使用）
- 署名時オフライン実行（外部API呼び出しなし）
- network入力は `testnet` / `mainnet`
- `P2WPKH` 入力のみ対応
- `wif` は `.env` の `BTC_WIF` / 任意環境変数 / JSON から取得（優先度順）
- 安全装置
  - `fee_sats > total_input * 0.5` はエラー
  - `0 < change < 294` はエラー（P2WPKH dust閾値）

## Requirements
- Node.js 20+
- npm

## Install
```bash
npm install
```

## Build
```bash
npm run build
```

## Usage
```bash
node dist/cli.js ./params.json
node dist/cli.js ./params.json --wif-env BTC_WIF
```

成功時は `stdout` に raw tx hex を1行で出力します。

## Environment File (safe commit policy)
- `.env.example` はコミット対象（値は空）
- `.env` はローカル専用（`.gitignore` で除外）

```bash
cp .env.example .env
# .env を編集して BTC_WIF を設定
```

WIFの優先順位:
1. `--wif-env <ENV_NAME>` で指定した環境変数
2. `.env` / 実行環境の `BTC_WIF`
3. `params.json` の `wif`

## JSON Format
```json
{
  "network": "testnet",
  "wif": "c...",
  "inputs": [
    {
      "txid": "<64hex>",
      "vout": 0,
      "value_sats": 100000,
      "script_pubkey": "0014..."
    }
  ],
  "outputs": [
    {
      "address": "tb1...",
      "value_sats": 80000
    }
  ],
  "change_address": "tb1...",
  "fee_sats": 1000
}
```

## Error Codes
- `ERR_INVALID_JSON`
- `ERR_INVALID_NETWORK`
- `ERR_INVALID_WIF`
- `ERR_UNSUPPORTED_SCRIPT_TYPE`
- `ERR_SCRIPT_MISMATCH`
- `ERR_INSUFFICIENT_FUNDS`
- `ERR_DUST_CHANGE`
- `ERR_FEE_TOO_HIGH`
- `ERR_SIGNING_FAILED`

## Design Decisions
- なぜUTXOをJSON入力にするか:
  - 本ツールは「署名コマンド実行時に完全オフライン」を保証するため、Explorer APIを直接呼びません。
  - そのため、署名前に必要なUTXO情報（`txid`, `vout`, `value_sats`, `script_pubkey`）を入力として受け取ります。
- SegWit署名と入力項目:
  - SegWit（BIP143系の署名ハッシュ）では、入力UTXOの金額とscript情報が署名計算に必要です。
  - よって `value_sats` / `script_pubkey` を必須にしています。
- 数値型について:
  - 本実装は `value_sats` / `fee_sats` を JavaScript `number` で扱います。
  - 提出用途では安全範囲内の値を前提とし、`Number.MAX_SAFE_INTEGER` 超えはバリデーションで拒否します。

## Testnet4 Broadcast Example
1. オフライン端末でraw tx hexを生成
2. オンライン端末で以下を実行

```bash
TXHEX="<paste raw tx hex>"
curl -sS -X POST "https://mempool.space/testnet4/api/tx" -H "Content-Type: text/plain" --data-raw "$TXHEX"
```

レスポンスは txid です。確認URL:
- `https://mempool.space/testnet4/tx/<txid>`

## Broadcast Result URL (for submission)
- 実際のブロードキャスト結果URLは、READMEには掲載しません。
- URL形式:
  - `https://mempool.space/testnet4/tx/<your_txid>`
- `curl` 実行結果で `txid` が返ったら、上記URLに差し込んでそのまま提出可能です。

## Submit Checklist
- [x] `npm run build` が成功（このリポジトリの現状態で実行済み）
- [x] `npm test` が成功（8 tests passed）
- [x] testnetでbroadcast成功し、確認URLを提出時に直接提示
- [x] `.env` 等の実値ファイルをコミットしていない
