import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { EventsService } from './events.service';
import { OrderEventListener } from './listeners/order.listener';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'KAFKA_SERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'robo-advisor',
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: {
            groupId: 'robo-advisor-consumer',
          },
        },
      },
    ]),
  ],
  providers: [EventsService, OrderEventListener],
  exports: [EventsService],
})
export class EventsModule {}
