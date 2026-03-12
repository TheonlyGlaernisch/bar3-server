import { Router } from 'express';
import { AuthenticatedRequest, apiKeyAuthMiddleware } from '../middleware/apiKeyAuth';
import * as userService from '../../services/userService';
import * as messageService from '../../services/messageService';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await userService.createUser(name);

    res.status(201).json({
      userId: result.user.userId,
      name: result.user.name,
      apiKey: result.apiKey,
      createdAt: result.user.createdAt,
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.get('/me', apiKeyAuthMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const user = await userService.getUser(authReq.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const messageCount = await messageService.getUserMessageCount(authReq.userId);

    res.json({
      ...user,
      messageCount,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.delete('/me', apiKeyAuthMiddleware, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const success = await userService.deleteUser(authReq.userId);

    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User and all associated data deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
