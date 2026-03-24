import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({
    description: 'Account holder name',
    example: 'John Doe',
    minLength: 2,
  })
  @IsString({ message: 'Name must be a string' })
  @MinLength(2, { message: 'Name must be at least 2 characters long' })
  name: string;

  @ApiProperty({
    description: 'Initial balance for the account',
    example: 10000,
    minimum: 0,
  })
  @IsNumber({}, { message: 'Initial balance must be a number' })
  @Min(0, { message: 'Initial balance cannot be negative' })
  initialBalance: number;
}
