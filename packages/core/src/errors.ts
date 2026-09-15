export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} was not found`, "not_found", 404);
  }
}

export class VersionConflictError extends DomainError {
  constructor(expected: number, actual: number) {
    super(
      `The review changed while you were working on it (expected v${expected}, found v${actual})`,
      "version_conflict",
      409,
    );
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`Review workflow cannot move from ${from} to ${to}`, "invalid_transition", 409);
  }
}
