import mongoose from 'mongoose';
import chalk from 'chalk';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://glaernischgaming_db_user:64WKiJPOcvufLvWP@glaernisch.0o1fjdx.mongodb.net/?appName=Glaernisch';
mongoose.set('strictQuery', true);
export async function connectMongoDB(): Promise<void> {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    } as any);
    
    console.log(chalk.green('✓ MongoDB connected successfully'));
  } catch (error) {
    console.error(chalk.red('✗ MongoDB connection failed:'), error);
    process.exit(1);
  }
}

export async function disconnectMongoDB(): Promise<void> {
  try {
    await mongoose.disconnect();
    console.log(chalk.green('✓ MongoDB disconnected'));
  } catch (error) {
    console.error(chalk.red('✗ MongoDB disconnection failed:'), error);
  }
}

export default mongoose;
