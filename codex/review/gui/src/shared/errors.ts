export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: unknown) { super(message); }
}
export class RequirementsError extends AppError {}
export class GitOperationError extends AppError {}
