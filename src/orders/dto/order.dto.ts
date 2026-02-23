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

export class PortfolioItemDto {
  @IsUUID('all', { message: 'stockId must be a valid UUID' })
  stockId: string;

  @IsNumber({}, { message: 'percentage must be a number' })
  @Min(0, { message: 'percentage must be at least 0' })
  @Max(100, { message: 'percentage must be between 0 and 100' })
  percentage: number;

  @IsOptional()
  @IsNumber({}, { message: 'marketPrice must be a number' })
  @Min(0, { message: 'marketPrice must be a positive number' })
  marketPrice?: number;
}

export class CreateOrderDto {
  @IsNumber({}, { message: 'amount must be a number' })
  @Min(0, { message: 'amount must be a positive number' })
  amount: number;

  @IsEnum(OrderType, { message: 'orderType must be BUY or SELL' })
  orderType: OrderType;

  @IsArray({ message: 'portfolio must be an array' })
  @ValidateNested({ each: true })
  @Type(() => PortfolioItemDto)
  portfolio: PortfolioItemDto[];
}
