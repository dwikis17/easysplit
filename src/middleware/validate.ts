import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

export function validate(input: {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (input.body) {
        req.body = input.body.parse(req.body);
      }
      if (input.query) {
        req.query = input.query.parse(req.query) as typeof req.query;
      }
      if (input.params) {
        req.params = input.params.parse(req.params) as typeof req.params;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
