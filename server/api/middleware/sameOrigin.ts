import { Request } from 'express';

export function isTrustedOrigin(req: Request): boolean {
  const origin = req.header('origin');
  if (!origin) return true;

  const forwardedProtoRaw = req.header('x-forwarded-proto');
  const forwardedProto = typeof forwardedProtoRaw === 'string'
    ? forwardedProtoRaw.split(',')[0].trim()
    : '';
  const host = req.header('x-forwarded-host') || req.header('host');
  if (!host) return false;
  const protocol = forwardedProto || req.protocol || 'http';
  return origin === `${protocol}://${host}`;
}
