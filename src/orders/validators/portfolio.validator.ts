import {
  registerDecorator,
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
      return true;
    }

    const stockIds = portfolio.map((item) => item.stockId);
    const uniqueStockIds = new Set(stockIds);

    return stockIds.length === uniqueStockIds.size;
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
