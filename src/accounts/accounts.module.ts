import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  imports: [EventsModule], // Import EventsModule to emit events
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService], // Export so OrdersModule can use it
})
export class AccountsModule {}
