import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import type { Order } from './interfaces/order.interface';
import { CreateOrderDto } from './dto/order.dto';
import { OrderType } from './enums/order.enums';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) { }

  @Get()
  @ApiOperation({
    summary: 'Get all portfolio investment orders',
    description: 'Optionally filter by orderType (BUY or SELL)',
  })
  @ApiQuery({
    name: 'orderType',
    required: false,
    enum: OrderType,
    description: 'Filter orders by type (BUY or SELL)',
  })
  @ApiResponse({ status: 200, description: 'List of orders' })
  getAllOrders(@Query('orderType') orderType?: OrderType): Order[] {
    return this.ordersService.findAll(orderType);
  }

  @Get('holdings')
  @ApiOperation({
    summary: 'Get platform balance, current holdings, and order statistics',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform balance, holdings, and order statistics',
  })
  getHoldings(): {
    platformBalance: number;
    holdings: Array<{ symbol: string; shares: number }>;
    totalInvested: number;
    totalOrdersBought: number;
    totalOrdersSold: number;
  } {
    return this.ordersService.getHoldings();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single order by ID' })
  @ApiResponse({ status: 200, description: 'Order found' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  getOrderById(@Param('id') id: string): Order {
    return this.ordersService.findOne(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Split an investment amount across a model portfolio',
    description: `Split investment across multiple stocks with optional idempotency support.
                  Use \`Idempotency-Key\` header to prevent duplicate orders (24h TTL).
                  Same key + same payload = cached response. Different payload = 400 error.`,
  })
  @ApiBody({
    type: CreateOrderDto,
    examples: {
      buy: {
        summary: 'Invest $100 — AAPL 60% + TSLA 40% (mixed prices)',
        value: {
          amount: 100,
          orderType: 'BUY',
          portfolio: [
            {
              stockId: 'a1b2c3d4-0001-4000-8000-000000000001',
              percentage: 60,
            },
            {
              stockId: 'a1b2c3d4-0002-4000-8000-000000000002',
              percentage: 40,
              marketPrice: 220,
            },
          ],
        },
      },
      buyDefault: {
        summary: 'Invest $100 — AAPL 60% + TSLA 40% (default price)',
        value: {
          amount: 100,
          orderType: 'BUY',
          portfolio: [
            {
              stockId: 'a1b2c3d4-0001-4000-8000-000000000001',
              percentage: 60,
            },
            {
              stockId: 'a1b2c3d4-0002-4000-8000-000000000002',
              percentage: 40,
            },
          ],
        },
      },
      sell: {
        summary: 'Sell $50 — AAPL 100%',
        value: {
          amount: 50,
          orderType: 'SELL',
          portfolio: [
            {
              stockId: 'a1b2c3d4-0001-4000-8000-000000000001',
              percentage: 100,
            },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Validation error, insufficient balance/shares, or idempotency conflict',
  })
  createOrder(
    @Body() createOrderDto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Order {
    return this.ordersService.create(createOrderDto, idempotencyKey);
  }
}
