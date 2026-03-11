import { Router } from 'express';
import { AuthenticatedRequest, apiKeyAuthMiddleware } from '../middleware/apiKeyAuth';
import * as messageService from '../../services/messageService';

const router = Router();

router.use(apiKeyAuthMiddleware);

router.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const { content, metadata } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const message = await messageService.saveMessage(
      req.userId,
      content,
      metadata
    );

    res.status(201).json(message);
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const messages = await messageService.getUserMessages(req.userId);
    res.json({
      count: messages.length,
      messages,
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.get('/search', async (req: AuthenticatedRequest, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const messages = await messageService.searchUserMessages(
      req.userId,
      q as string
    );

    res.json({
      count: messages.length,
      messages,
    });
  } catch (error) {
    console.error('Error searching messages:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

router.get('/:messageId', async (req: AuthenticatedRequest, res) => {
  try {
    const message = await messageService.getMessageById(
      req.userId,
      req.params.messageId
    );

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(message);
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({ error: 'Failed to fetch message' });
  }
});

router.put('/:messageId', async (req: AuthenticatedRequest, res) => {
  try {
    const { content, metadata } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const message = await messageService.updateMessage(
      req.userId,
      req.params.messageId,
      content,
      metadata
    );

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(message);
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

router.delete('/:messageId', async (req: AuthenticatedRequest, res) => {
  try {
    const success = await messageService.deleteMessage(
      req.userId,
      req.params.messageId
    );

    if (!success) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

export default router;
