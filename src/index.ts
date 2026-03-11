import express from 'express';
import cors from 'cors';
import chalk from 'chalk';
import { connectMongoDB, disconnectMongoDB } from './loaders/mongodb';
import userRoutes from './api/routes/users';
import messageRoutes from './api/routes/messages';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(chalk.red('Error:'), err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    await connectMongoDB();

    app.listen(PORT, () => {
      console.log(chalk.blue(`Server running on port ${PORT}`));
    });
  } catch (error) {
    console.error(chalk.red('Failed to start server:'), error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\nShutting down gracefully...'));
  await disconnectMongoDB();
  process.exit(0);
});

start();
