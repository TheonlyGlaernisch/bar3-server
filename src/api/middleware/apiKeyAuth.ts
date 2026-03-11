import { Request, Response, NextFunction } from 'express';
import * as userService from '../../services/userService';

export interface AuthenticatedRequest extends Request {
  userId: string;
  apiKey: string;
}

export async function apiKeyAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
        hint: 'Include x-api-key header',
      });
    }

    const validation = await userService.validateApiKey(apiKey);

    if (!validation.isValid) {
      return res.status(403).json({ error: 'Invalid or expired API key' });
    }

    req.userId = validation.userId;
    req.apiKey = apiKey;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
