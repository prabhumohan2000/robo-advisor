import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Robo-Advisor API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Check', () => {
    it('/health (GET) should return server status', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect({ status: 'ok', message: 'Server is running' });
    });
  });


  describe('Stocks', () => {
    describe('/stocks (GET)', () => {
      it('should return list of available stocks', () => {
        return request(app.getHttpServer())
          .get('/stocks')
          .expect(200)
          .expect((res) => {
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
            expect(res.body[0]).toHaveProperty('id');
            expect(res.body[0]).toHaveProperty('symbol');
            expect(res.body[0]).toHaveProperty('name');
          });
      });
    });
  });

  describe('Orders', () => {
    let stockId: string;
    let orderId: string;

    beforeAll(async () => {
      // Get a stock ID for testing
      const stocksResponse = await request(app.getHttpServer())
        .get('/stocks')
        .expect(200);
      stockId = stocksResponse.body[0].id;
    });

    describe('/orders (GET)', () => {
      it('should get all orders', () => {
        return request(app.getHttpServer())
          .get('/orders')
          .expect(200)
          .expect((res) => {
            expect(Array.isArray(res.body)).toBe(true);
          });
      });
    });

    describe('/orders (POST)', () => {
      it('should create a BUY order successfully', () => {
        return request(app.getHttpServer())
          .post('/orders')
          .send({
            amount: 100,
            orderType: 'BUY',
            portfolio: [
              {
                stockId: stockId,
                percentage: 100,
                marketPrice: 150,
              },
            ],
          })
          .expect(201)
          .expect((res) => {
            expect(res.body).toHaveProperty('id');
            expect(res.body).toHaveProperty('orderType', 'BUY');
            expect(res.body).toHaveProperty('totalAmount', 100);
            expect(res.body).toHaveProperty('items');
            expect(Array.isArray(res.body.items)).toBe(true);
            expect(res.body).toHaveProperty('status');
            orderId = res.body.id;
          });
      });

      it('should fail with invalid amount', () => {
        return request(app.getHttpServer())
          .post('/orders')
          .send({
            amount: -50,
            orderType: 'BUY',
            portfolio: [
              {
                stockId: stockId,
                percentage: 100,
              },
            ],
          })
          .expect(400);
      });

      it('should fail with invalid order type', () => {
        return request(app.getHttpServer())
          .post('/orders')
          .send({
            amount: 100,
            orderType: 'INVALID',
            portfolio: [
              {
                stockId: stockId,
                percentage: 100,
              },
            ],
          })
          .expect(400);
      });

      it('should fail with invalid stock ID format', () => {
        return request(app.getHttpServer())
          .post('/orders')
          .send({
            amount: 100,
            orderType: 'BUY',
            portfolio: [
              {
                stockId: 'invalid-uuid',
                percentage: 100,
              },
            ],
          })
          .expect(400);
      });

      it('should fail with duplicate stocks in portfolio', () => {
        return request(app.getHttpServer())
          .post('/orders')
          .send({
            amount: 100,
            orderType: 'BUY',
            portfolio: [
              {
                stockId: stockId,
                percentage: 50,
                marketPrice: 150,
              },
              {
                stockId: stockId,
                percentage: 50,
                marketPrice: 150,
              },
            ],
          })
          .expect(400)
          .expect((res) => {
            const message = Array.isArray(res.body.message) ? res.body.message.join(' ') : res.body.message;
            expect(message.toLowerCase()).toContain('duplicate');
          });
      });

      it('should fail with empty portfolio array', () => {
        return request(app.getHttpServer())
          .post('/orders')
          .send({
            amount: 100,
            orderType: 'BUY',
            portfolio: [],
          })
          .expect(400)
          .expect((res) => {
            expect(Array.isArray(res.body.message) ? res.body.message[0] : res.body.message).toContain('at least one stock');
          });
      });

      it('should fail with negative market price', () => {
        return request(app.getHttpServer())
          .post('/orders')
          .send({
            amount: 100,
            orderType: 'BUY',
            portfolio: [
              {
                stockId: stockId,
                percentage: 100,
                marketPrice: -10,
              },
            ],
          })
          .expect(400);
      });

      it('should fail with zero amount', () => {
        return request(app.getHttpServer())
          .post('/orders')
          .send({
            amount: 0,
            orderType: 'BUY',
            portfolio: [
              {
                stockId: stockId,
                percentage: 100,
              },
            ],
          })
          .expect(400);
      });

      it('should fail with percentages not summing to 100', () => {
        return request(app.getHttpServer())
          .post('/orders')
          .send({
            amount: 100,
            orderType: 'BUY',
            portfolio: [
              {
                stockId: stockId,
                percentage: 60,
              },
            ],
          })
          .expect(400)
          .expect((res) => {
            expect(Array.isArray(res.body.message) ? res.body.message.join(' ') : res.body.message).toContain('must sum to 100');
          });
      });

      it('should handle precise decimal calculations', async () => {
        const stocksResponse = await request(app.getHttpServer())
          .get('/stocks')
          .expect(200);

        const stock1 = stocksResponse.body[0].id;
        const stock2 = stocksResponse.body[1].id;

        return request(app.getHttpServer())
          .post('/orders')
          .send({
            amount: 1000.33,
            orderType: 'BUY',
            portfolio: [
              {
                stockId: stock1,
                percentage: 33.33,
                marketPrice: 150.5,
              },
              {
                stockId: stock2,
                percentage: 66.67,
                marketPrice: 200.25,
              },
            ],
          })
          .expect(201)
          .expect((res) => {
            expect(res.body.totalAmount).toBe(1000.33);
            expect(res.body.items).toHaveLength(2);
          });
      });
    });

    describe('/orders/:id (GET)', () => {
      it('should get specific order by ID', () => {
        return request(app.getHttpServer())
          .get(`/orders/${orderId}`)
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty('id', orderId);
            expect(res.body).toHaveProperty('orderType');
            expect(res.body).toHaveProperty('totalAmount');
            expect(res.body).toHaveProperty('items');
          });
      });

      it('should fail with non-existent order ID', () => {
        return request(app.getHttpServer())
          .get('/orders/a1b2c3d4-0000-4000-8000-000000000000')
          .expect(404);
      });
    });
  });
});
