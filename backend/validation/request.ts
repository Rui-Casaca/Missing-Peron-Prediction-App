import type { Request, Response } from 'express';
import type { ZodError, ZodType } from 'zod';

export function formatZodError(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message
  }));
}

export function parseBody<T>(schema: ZodType<T>, req: Request, res: Response): T | null {
  const parsed = schema.safeParse(req.body);
  if (parsed.success) return parsed.data;
  res.status(400).json({
    success: false,
    error: 'Payload inválido',
    details: formatZodError(parsed.error)
  });
  return null;
}

export function parseQuery<T>(schema: ZodType<T>, req: Request, res: Response): T | null {
  const parsed = schema.safeParse(req.query);
  if (parsed.success) return parsed.data;
  res.status(400).json({
    success: false,
    error: 'Query inválida',
    details: formatZodError(parsed.error)
  });
  return null;
}
