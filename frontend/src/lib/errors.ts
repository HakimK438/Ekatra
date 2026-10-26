/** One error type for the mock and the real API: a stable code plus a message a person can act on. */
export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}
