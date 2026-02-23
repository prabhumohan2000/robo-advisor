import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { STOCKS } from './stocks.constants';

@ApiTags('stocks')
@Controller('stocks')
export class StocksController {
  @Get()
  @ApiOperation({ summary: 'List all available stocks' })
  @ApiResponse({ status: 200, description: 'List of stocks' })
  getAllStocks() {
    return Object.values(STOCKS);
  }
}
