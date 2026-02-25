import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { HoldingsSummary, Order } from './interfaces/order.interface';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/order.dto';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all portfolio investment orders for the authenticated user',
  })
  @ApiResponse({ status: 200, description: 'List of orders' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getAllOrders(@Req() req: Request): Order[] {
    return this.ordersService.findAll(req.user!.sub);
  }

  @Get('holdings')
  @ApiOperation({
    summary: 'Get current holdings summary — shares, invested, sold per stock',
  })
  @ApiResponse({ status: 200, description: 'Holdings summary' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getHoldings(@Req() req: Request): HoldingsSummary {
    return this.ordersService.getHoldings(req.user!.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single order by ID' })
  @ApiResponse({ status: 200, description: 'Order found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  getOrderById(@Req() req: Request, @Param('id') id: string): Order {
    return this.ordersService.findOne(id, req.user!.sub);
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
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  createOrder(
    @Req() req: Request,
    @Body() createOrderDto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Order {
    return this.ordersService.create(createOrderDto, req.user!.sub, idempotencyKey);
  }
}
