import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderType } from '../enums/order.enums';
import {
  IsMinArrayLength,
  IsNoDuplicateStocks,
} from '../validators/portfolio.validator';

export class PortfolioItemDto {
  @ApiProperty({
    description: 'Stock UUID',
    example: 'a1b2c3d4-0001-4000-8000-000000000001',
  })
  @IsUUID('all', { message: 'stockId must be a valid UUID' })
  stockId: string;

  @ApiProperty({
    description: 'Percentage allocation for this stock (0-100)',
    example: 60,
    minimum: 0,
    maximum: 100,
  })
  @IsNumber({}, { message: 'percentage must be a number' })
  @Min(0, { message: 'percentage must be at least 0' })
  @Max(100, { message: 'percentage must be between 0 and 100' })
  percentage: number;

  @ApiProperty({
    description: 'Optional market price for the stock',
    example: 150,
    required: false,
    minimum: 0.01,
  })
  @IsOptional()
  @IsNumber({}, { message: 'marketPrice must be a number' })
  @Min(0.01, { message: 'marketPrice must be greater than 0' })
  marketPrice?: number;
}

export class CreateOrderDto {
  @ApiProperty({
    description: 'Total amount to invest or sell',
    example: 100,
    minimum: 0.01,
  })
  @IsNumber({}, { message: 'amount must be a number' })
  @Min(0.01, { message: 'amount must be greater than 0' })
  amount: number;

  @ApiProperty({
    description: 'Order type: BUY or SELL',
    enum: OrderType,
    example: OrderType.BUY,
  })
  @IsEnum(OrderType, { message: 'orderType must be BUY or SELL' })
  orderType: OrderType;

  @ApiProperty({
    description:
      'Array of portfolio items with stock allocations. Must contain at least one stock, percentages must sum to 100, and no duplicate stocks allowed.',
    type: [PortfolioItemDto],
    example: [
      {
        stockId: 'a1b2c3d4-0001-4000-8000-000000000001',
        percentage: 60,
        marketPrice: 150,
      },
      {
        stockId: 'a1b2c3d4-0002-4000-8000-000000000002',
        percentage: 40,
        marketPrice: 220,
      },
    ],
  })
  @IsArray({ message: 'portfolio must be an array' })
  @IsMinArrayLength(1, { message: 'portfolio must contain at least one stock' })
  @IsNoDuplicateStocks({
    message: 'portfolio cannot contain duplicate stocks',
  })
  @ValidateNested({ each: true })
  @Type(() => PortfolioItemDto)
  portfolio: PortfolioItemDto[];
}
