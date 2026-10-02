/** The status codes the app reacts to: a name says more than a bare 404. */
export const HTTP_STATUS = {
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  PRECONDITION_FAILED: 412,
  TOO_MANY_REQUESTS: 429,
} as const;
