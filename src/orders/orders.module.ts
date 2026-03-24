import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountsModule } from '../accounts/accounts.module';
import { EventsModule } from '../events/events.module';
import { OrderExecutionService } from './order-execution.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AccountsModule,
    EventsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderExecutionService],
  exports: [OrdersService, OrderExecutionService],
})
export class OrdersModule { }
