export class ServiceDependencyError extends Error {
  readonly status: number;
  readonly code: string;
  readonly dependency: string;

  constructor(code: string, dependency: string, message: string, status = 503) {
    super(message);
    this.status = status;
    this.code = code;
    this.dependency = dependency;
  }
}
