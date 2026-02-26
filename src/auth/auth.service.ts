import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { TokenResponseDto } from './dto/auth.dto';
import { JwtPayload } from './interfaces/auth.interface';

@Injectable()
export class AuthService {
  // JWT expiration time in seconds (6 hours = 21600 seconds)
  private readonly JWT_EXPIRES_IN = 6 * 60 * 60;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(email: string, password: string): Promise<TokenResponseDto> {
    const user = await this.usersService.create(email, password);
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.generateTokenResponse(payload);
  }

  async login(email: string, password: string): Promise<TokenResponseDto> {
    const user = this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await this.usersService.validatePassword(
      password,
      user.passwordHash,
    );
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.generateTokenResponse(payload);
  }

  getMe(userId: string): { email: string; balance: number } {
    const user = this.usersService.findById(userId);
    return { email: user.email, balance: user.balance };
  }

  private generateTokenResponse(payload: JwtPayload): TokenResponseDto {
    return {
      accessToken: this.jwtService.sign(payload),
      token_type: 'Bearer',
      expires_in: this.JWT_EXPIRES_IN,
      grant_type: 'password',
    };
  }
}
