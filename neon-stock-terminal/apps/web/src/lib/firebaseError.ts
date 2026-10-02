/** Inspect the public error contract without eagerly downloading Firebase SDKs. */
export function isFirebaseError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && error.name === "FirebaseError" && "code" in error && typeof error.code === "string";
}
