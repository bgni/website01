export class FixtureValidationError extends Error {
  readonly ctx: string;

  constructor(ctx: string, message: string) {
    super(`${ctx}: ${message}`);
    this.name = "FixtureValidationError";
    this.ctx = ctx;
  }
}
