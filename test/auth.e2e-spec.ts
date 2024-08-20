import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Authentication System (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('handles a signup request', () => {
    const email = 'tesq323t2e2e@test.com';

    return request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email,
        password: '123456',
      })
      .expect(201)
      .then((response) => {
        expect(response.body.id).toBeDefined();
        expect(response.body.email).toEqual(email);
      });
  });
  it('signup as a new user then get the currently logged in user', async () => {
    const email = 'testeque@test.com';

    const res = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email,
        password: '123456',
      })
      .expect(201);

    const cookie = res.get('Set-Cookie');

    return request(app.getHttpServer())
      .get('/auth/whoami')
      .set('Cookie', cookie)
      .expect(200)
      .then((response) => {
        expect(response.body.id).toBeDefined();
        expect(response.body.email).toEqual(email);
      });
  });
});
