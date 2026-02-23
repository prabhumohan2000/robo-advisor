import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  // Production improvement 3: NestJS Logger instead of console.log
  // Supports log levels (log/warn/error/debug), structured output,
  // and can be swapped for a JSON logger (e.g. pino) in production.
  private readonly logger = new Logger(LoggerMiddleware.name);

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      this.logger.log(`[${req.method}] ${req.path} — ${ms}ms`);
    });
    next();
  }
}
