import { AuthService } from '../src/auth/auth.service';
import { UnsubscribeService } from '../src/compliance/unsubscribe.service';
import { Role } from '@prisma/client';

describe('Auth & Compliance Services', () => {
  it('should hash and verify passwords securely', async () => {
    const rawPassword = 'SuperSecretPassword2026!';
    const hash = await AuthService.hashPassword(rawPassword);

    expect(hash).not.toBe(rawPassword);
    expect(await AuthService.comparePassword(rawPassword, hash)).toBe(true);
    expect(await AuthService.comparePassword('WrongPassword', hash)).toBe(false);
  });

  it('should generate and verify JWT tokens with user payload', () => {
    const payload = {
      id: 'user-uuid-123',
      email: 'admin@bulkemail.cloud',
      name: 'Admin User',
      role: Role.ADMIN,
    };

    const token = AuthService.generateToken(payload);
    expect(typeof token).toBe('string');

    const decoded = AuthService.verifyToken(token);
    expect(decoded.id).toBe(payload.id);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(Role.ADMIN);
  });

  it('should generate RFC 8058 List-Unsubscribe headers', () => {
    const headers = UnsubscribeService.generateHeaders('user@example.com', 'rec-123', 'camp-456');

    expect(headers['List-Unsubscribe']).toContain('http');
    expect(headers['List-Unsubscribe']).toContain('token=');
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});
