import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import type {
  DomainEvent,
  OrderCreatedEvent,
  OrderExecutedEvent,
  BalanceUpdatedEvent,
  HoldingsUpdatedEvent,
} from './interfaces/events.interface';
import { EventType } from './interfaces/events.interface';

@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger(EventsService.name);
  private readonly eventHistory: DomainEvent[] = [];

  constructor(
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    const eventTypes = Object.values(EventType);
    eventTypes.forEach((eventType) => {
      this.kafkaClient.subscribeToResponseOf(eventType);
    });

    await this.kafkaClient.connect();
    this.logger.log('Kafka client connected successfully');
  }

  emit(event: DomainEvent): void {
    this.eventHistory.push(event);
    this.kafkaClient.emit(event.type, event);
    this.logger.log(`Event sent to Kafka: ${event.type}`, {
      type: event.type,
      timestamp: event.timestamp,
    });
  }

  emitOrderCreated(event: Omit<OrderCreatedEvent, 'type' | 'timestamp'>): void {
    this.emit({
      type: EventType.ORDER_CREATED,
      timestamp: new Date().toISOString(),
      ...event,
    });
  }

  emitBalanceUpdated(
    event: Omit<BalanceUpdatedEvent, 'type' | 'timestamp'>,
  ): void {
    this.emit({
      type: EventType.BALANCE_UPDATED,
      timestamp: new Date().toISOString(),
      ...event,
    });
  }

  emitHoldingsUpdated(
    event: Omit<HoldingsUpdatedEvent, 'type' | 'timestamp'>,
  ): void {
    this.emit({
      type: EventType.HOLDINGS_UPDATED,
      timestamp: new Date().toISOString(),
      ...event,
    });
  }

  emitOrderExecuted(
    event: Omit<OrderExecutedEvent, 'type' | 'timestamp'>,
  ): void {
    this.emit({
      type: EventType.ORDER_EXECUTED,
      timestamp: new Date().toISOString(),
      ...event,
    });
  }

  getEventHistory(): DomainEvent[] {
    return [...this.eventHistory];
  }

  getEventsByType(type: EventType): DomainEvent[] {
    return this.eventHistory.filter((event) => event.type === type);
  }

  clearHistory(): void {
    this.eventHistory.length = 0;
    this.logger.log('Event history cleared');
  }
}
