export class InvocationError extends Error {
  override name = "InvocationError";
}

/** A repository-relative path that resolves through a symlink outside the checkout. */
export class RepositoryPathError extends InvocationError {
  override name = "RepositoryPathError";
}
