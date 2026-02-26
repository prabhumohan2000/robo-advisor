import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, SignupDto, TokenResponseDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({
    type: SignupDto,
    examples: {
      example: {
        summary: 'Sample signup',
        value: { email: 'user@example.com', password: 'secret123' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'User created, returns JWT token with metadata',
    type: TokenResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async signup(@Body() dto: SignupDto): Promise<TokenResponseDto> {
    return this.authService.signup(dto.email, dto.password);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({
    type: LoginDto,
    examples: {
      example: {
        summary: 'Sample login',
        value: { email: 'user@example.com', password: 'secret123' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Returns JWT token with metadata',
    type: TokenResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto): Promise<TokenResponseDto> {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile and balance' })
  @ApiResponse({ status: 200, description: 'User profile with balance' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMe(@Req() req: Request): { email: string; balance: number } {
    return this.authService.getMe(req.user!.sub);
  }
}
