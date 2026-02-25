import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { PortfolioItemDto } from '../dto/order.dto';

@ValidatorConstraint({ name: 'IsNoDuplicateStocks', async: false })
export class IsNoDuplicateStocksConstraint
  implements ValidatorConstraintInterface
{
  validate(portfolio: PortfolioItemDto[]): boolean {
    if (!Array.isArray(portfolio)) {
      return true; // Let @IsArray handle this
    }

    const stockIds = portfolio.map((item) => item.stockId);
    const uniqueStockIds = new Set(stockIds);

    return stockIds.length === uniqueStockIds.size;
  }

  defaultMessage(args: ValidationArguments): string {
    const portfolio = args.value as PortfolioItemDto[];
    const stockIds = portfolio.map((item) => item.stockId);
    const duplicates = stockIds.filter(
      (id, index) => stockIds.indexOf(id) !== index,
    );
    return `Duplicate stocks found in portfolio: ${[...new Set(duplicates)].join(', ')}`;
  }
}

export function IsNoDuplicateStocks(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsNoDuplicateStocksConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'IsMinArrayLength', async: false })
export class IsMinArrayLengthConstraint
  implements ValidatorConstraintInterface
{
  validate(portfolio: PortfolioItemDto[], args: ValidationArguments): boolean {
    const [minLength] = args.constraints;
    if (!Array.isArray(portfolio)) {
      return true; // Let @IsArray handle this
    }
    return portfolio.length >= minLength;
  }

  defaultMessage(args: ValidationArguments): string {
    const [minLength] = args.constraints;
    return `Portfolio must contain at least ${minLength} stock(s)`;
  }
}

export function IsMinArrayLength(
  minLength: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [minLength],
      validator: IsMinArrayLengthConstraint,
    });
  };
}
