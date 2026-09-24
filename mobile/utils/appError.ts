/**
 * Base class for errors the app raises itself (as opposed to axios/network
 * errors). Their `message` is written for the user, so `extractErrorMessage`
 * can display it directly.
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
