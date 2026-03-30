import Message from '../interfaces/schemas/MessageSchema';      // Model (default export)
import { IMessage } from '../interfaces/schemas/MessageSchema'; // Interface (named export)



export interface MessageResponse {
  id: string;
  userId: string;
  content: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export async function saveMessage(
  userId: string,
  content: string,
  metadata?: Record<string, any>
): Promise<MessageResponse> {
  const message = await Message.create({
    userId,
    content,
    metadata: metadata || {},
  });

  return messageToResponse(message);
}

export async function getUserMessages(userId: string): Promise<MessageResponse[]> {
  const messages = await Message.find({ userId })
    .sort({ createdAt: -1 })
    .exec();

  return messages.map(messageToResponse);
}

export async function getMessageById(
  userId: string,
  messageId: string
): Promise<MessageResponse | null> {
  const message = await Message.findOne({
    _id: messageId,
    userId,
  });

  if (!message) {
    return null;
  }

  return messageToResponse(message);
}

export async function updateMessage(
  userId: string,
  messageId: string,
  content: string,
  metadata?: Record<string, any>
): Promise<MessageResponse | null> {
  const message = await Message.findOneAndUpdate(
    { _id: messageId, userId },
    {
      content,
      metadata: metadata || {},
      updatedAt: new Date(),
    },
    { new: true }
  );

  if (!message) {
    return null;
  }

  return messageToResponse(message);
}

export async function deleteMessage(
  userId: string,
  messageId: string
): Promise<boolean> {
  const result = await Message.findOneAndDelete({
    _id: messageId,
    userId,
  });

  return result !== null;
}

export async function deleteAllUserMessages(userId: string): Promise<number> {
  const result = await Message.deleteMany({ userId });
  return result.deletedCount || 0;
}

export async function getUserMessageCount(userId: string): Promise<number> {
  return Message.countDocuments({ userId });
}

export async function searchUserMessages(
  userId: string,
  searchTerm: string
): Promise<MessageResponse[]> {
  const messages = await Message.find({
    userId,
    content: { $regex: searchTerm, $options: 'i' },
  }).exec();

  return messages.map(messageToResponse);
}

function messageToResponse(message: IMessage): MessageResponse {
  return {
    id: message._id.toString(),
    userId: message.userId.toString(),
    bodyHtml: message.bodyHtml,         // <-- changed from content
    bodyCss: message.bodyCss || '',     // <-- add this line if you want to expose CSS
    metadata: message.metadata,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}
