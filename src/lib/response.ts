import type { Response } from 'express';

export function sendData<T>(res: Response, data: T, statusCode = 200, meta?: Record<string, unknown>) {
  return res.status(statusCode).json({
    data,
    meta: {
      request_id: res.req.requestId,
      ...meta,
    },
  });
}

export function sendNoContent(res: Response) {
  return res.status(204).send();
}
