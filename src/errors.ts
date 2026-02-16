export type ErrorCode =
  | 'ERR_INVALID_JSON'
  | 'ERR_INVALID_NETWORK'
  | 'ERR_INVALID_WIF'
  | 'ERR_UNSUPPORTED_SCRIPT_TYPE'
  | 'ERR_SCRIPT_MISMATCH'
  | 'ERR_INSUFFICIENT_FUNDS'
  | 'ERR_DUST_CHANGE'
  | 'ERR_FEE_TOO_HIGH'
  | 'ERR_SIGNING_FAILED';

export class AppError extends Error {
  public readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'AppError';
  }
}
