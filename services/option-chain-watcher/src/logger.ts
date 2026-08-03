export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  [k: string]: unknown;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeError(err: unknown): { message: string; stack?: string } | undefined {
  if (!err) return undefined;
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  try {
    return { message: String(err) };
  } catch {
    return { message: 'Unknown error' };
  }
}

export class Logger {
  constructor(private readonly component: string) { }

  log(level: LogLevel, msg: string, fields: LogFields = {}, err?: unknown) {
    const payload: Record<string, unknown> = {
      time: nowIso(),
      level: level.toUpperCase(),
      service: this.component,
      msg,
      ...fields,
    };

    const e = normalizeError(err);
    if (e) payload.err = e;

    const line = JSON.stringify(payload);
    if (level === 'error') {
      // stderr helps highlight errors in docker logs.
      process.stderr.write(line + '\n');
      return;
    }
    process.stdout.write(line + '\n');
  }

  debug(msg: string, fields?: LogFields) {
    this.log('debug', msg, fields);
  }
  info(msg: string, fields?: LogFields) {
    this.log('info', msg, fields);
  }
  warn(msg: string, fields?: LogFields, err?: unknown) {
    this.log('warn', msg, fields, err);
  }
  error(msg: string, fields?: LogFields, err?: unknown) {
    this.log('error', msg, fields, err);
  }
}
