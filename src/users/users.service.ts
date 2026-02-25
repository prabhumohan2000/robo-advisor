import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { User } from './interfaces/user.interface';

@Injectable()
export class UsersService {
  private readonly users: User[] = [];
  private readonly SALT_ROUNDS = 10;
  private readonly initialBalance: number;

  constructor(private readonly configService: ConfigService) {
    const balance = this.configService.get<string>('INITIAL_BALANCE');
    this.initialBalance = balance ? Number(balance) : 10000;
  }

  async create(email: string, password: string): Promise<User> {
    const existing = this.users.find((u) => u.email === email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);
    const user: User = {
      id: randomUUID(),
      email,
      passwordHash,
      balance: this.initialBalance,
      createdAt: new Date().toISOString(),
    };
    this.users.push(user);
    return user;
  }

  findByEmail(email: string): User | undefined {
    return this.users.find((u) => u.email === email);
  }

  findById(id: string): User {
    const user = this.users.find((u) => u.id === id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  deductBalance(userId: string, amount: number): void {
    const user = this.findById(userId);
    user.balance = Math.round((user.balance - amount) * 100) / 100;
  }

  addBalance(userId: string, amount: number): void {
    const user = this.findById(userId);
    user.balance = Math.round((user.balance + amount) * 100) / 100;
  }

  async validatePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
