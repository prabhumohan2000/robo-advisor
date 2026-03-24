import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import type { Account, AccountBalance } from './interfaces/account.interface';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new account',
    description: 'Create a new trading account with an initial balance',
  })
  @ApiBody({
    type: CreateAccountDto,
    examples: {
      example1: {
        summary: 'Create account with $10,000',
        value: {
          name: 'John Doe',
          initialBalance: 10000,
        },
      },
      example2: {
        summary: 'Create account with $50,000',
        value: {
          name: 'Jane Smith',
          initialBalance: 50000,
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Account created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  createAccount(@Body() createAccountDto: CreateAccountDto): any {
    return this.accountsService.create(createAccountDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all accounts',
    description: 'Retrieve a list of all trading accounts',
  })
  @ApiResponse({ status: 200, description: 'List of accounts' })
  getAllAccounts(): any[] {
    return this.accountsService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get account by ID',
    description: 'Retrieve a single account by its ID',
  })
  @ApiResponse({ status: 200, description: 'Account found' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  getAccount(@Param('id') id: string): any {
    return this.accountsService.findOneForApi(id);
  }

  @Get(':id/balance')
  @ApiOperation({
    summary: 'Get account balance and holdings',
    description:
      'Retrieve the current balance, total invested, and stock holdings for an account',
  })
  @ApiResponse({
    status: 200,
    description: 'Account balance and holdings',
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  getAccountBalance(@Param('id') id: string): AccountBalance {
    return this.accountsService.getBalance(id);
  }

  @Post(':id/deposit')
  @ApiOperation({
    summary: 'Deposit funds to account',
    description: 'Add funds to an existing account',
  })
  @ApiBody({
    type: DepositDto,
    examples: {
      deposit1000: {
        summary: 'Deposit $1,000',
        value: { amount: 1000 },
      },
      deposit5000: {
        summary: 'Deposit $5,000',
        value: { amount: 5000 },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Deposit successful' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  deposit(@Param('id') id: string, @Body() depositDto: DepositDto): any {
    return this.accountsService.deposit(id, depositDto.amount);
  }

  @Post(':id/withdraw')
  @ApiOperation({
    summary: 'Withdraw funds from account',
    description: 'Remove funds from an existing account',
  })
  @ApiBody({
    type: WithdrawDto,
    examples: {
      withdraw500: {
        summary: 'Withdraw $500',
        value: { amount: 500 },
      },
      withdraw2000: {
        summary: 'Withdraw $2,000',
        value: { amount: 2000 },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Withdrawal successful' })
  @ApiResponse({
    status: 400,
    description: 'Validation error or insufficient balance',
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  withdraw(
    @Param('id') id: string,
    @Body() withdrawDto: WithdrawDto,
  ): any {
    return this.accountsService.withdraw(id, withdrawDto.amount);
  }
}
