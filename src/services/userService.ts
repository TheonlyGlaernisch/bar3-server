import crypto from 'crypto';
import { User, IUser } from '../interfaces/schemas/UserSchema';
import * as MessageSchemaModule from '../interfaces/schemas/MessageSchema';

export interface UserResponse {
  userId: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface UserCreateResponse {
  user: UserResponse;
  apiKey: string;
}

function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

export async function createUser(name: string): Promise<UserCreateResponse> {
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  const user = await User.create({
    name,
    apiKeyHash,
    lastUsedAt: new Date(),
  });

  return {
    user: {
      userId: user._id.toString(),
      name: user.name,
      createdAt: user.createdAt,
      lastUsedAt: user.lastUsedAt,
    },
    apiKey,
  };
}

export async function validateApiKey(apiKey: string): Promise<{
  isValid: boolean;
  userId: string;
}> {
  const apiKeyHash = hashApiKey(apiKey);

  const user = await User.findOne({ apiKeyHash });

  if (!user) {
    return { isValid: false, userId: '' };
  }

  user.lastUsedAt = new Date();
  await user.save();

  return { isValid: true, userId: user._id.toString() };
}

export async function getUser(userId: string): Promise<UserResponse | null> {
  const user = await User.findById(userId);

  if (!user) {
    return null;
  }

  return {
    userId: user._id.toString(),
    name: user.name,
    createdAt: user.createdAt,
    lastUsedAt: user.lastUsedAt,
  };
}

export async function getAllUsers(): Promise<UserResponse[]> {
  const users = await User.find();
  return users.map(user => ({
    userId: user._id.toString(),
    name: user.name,
    createdAt: user.createdAt,
    lastUsedAt: user.lastUsedAt,
  }));
}

export async function deleteUser(userId: string): Promise<boolean> {
  const MessageModel = (MessageSchemaModule as any).Message;
  if (!MessageModel || typeof MessageModel.deleteMany !== 'function') {
    throw new Error('Message model is not available from MessageSchema module');
  }

  await MessageModel.deleteMany({ userId });

  const result = await User.findByIdAndDelete(userId);

  return result !== null;
}
