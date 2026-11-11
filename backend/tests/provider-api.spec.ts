import request from 'supertest';
import { app } from '../src/index';
import jwt from 'jsonwebtoken';
import { config } from '../src/config';
import { Role } from '@prisma/client';

describe('Provider Management API Routes', () => {
  let adminToken: string;

  beforeAll(() => {
    // Generate valid admin token
    adminToken = jwt.sign(
      { userId: 'admin-test-id', email: 'admin@bulkemail.cloud', role: Role.ADMIN },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
  });

  it('GET /api/v1/providers should list all configured providers', async () => {
    const res = await request(app)
      .get('/api/v1/providers')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.providers)).toBe(true);
    expect(res.body.providers.length).toBeGreaterThanOrEqual(1);

    const ses = res.body.providers.find((p: any) => p.providerType === 'SES');
    expect(ses).toBeDefined();
    expect(ses.dailyQuota).toBeDefined();
    expect(ses.perSecondRateLimit).toBeDefined();
  });

  it('GET /api/v1/providers/:id should return single provider with capacity and limiter', async () => {
    const res = await request(app)
      .get('/api/v1/providers/default-ses-account')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.provider).toBeDefined();
    expect(res.body.provider.id).toBe('default-ses-account');
    expect(res.body.provider.capacity).toBeDefined();
    expect(res.body.provider.capacity.dailyRemaining).toBeDefined();
  });

  it('POST /api/v1/providers/:id/test should run health check on adapter', async () => {
    const res = await request(app)
      .post('/api/v1/providers/default-mock-account/test')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.health).toBeDefined();
    expect(res.body.health.status).toBe('ACTIVE');
    expect(res.body.health.healthStatus).toBe('HEALTHY');
  });

  it('PATCH /api/v1/providers/:id should update provider settings', async () => {
    const res = await request(app)
      .patch('/api/v1/providers/default-mock-account')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        perSecondRateLimit: 45.0,
        priority: 5,
      });

    expect(res.status).toBe(200);
    expect(res.body.provider.perSecondRateLimit).toBe(45.0);
    expect(res.body.provider.priority).toBe(5);
  });
});
