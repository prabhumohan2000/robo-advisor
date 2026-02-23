export interface JwtPayload {
  sub: string;
  email: string;
}

declare module 'express' {
  interface Request {
    user?: JwtPayload;
  }
}
