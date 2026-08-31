import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(email: string, password: string) {
    if (
      email !== 'test@example.com' ||
      password !== 'test123'
    ) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    const payload = {
      sub: 1,
      email: 'test@example.com',
      name: 'Test User',
    };

    const accessToken =
      await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
      },
    };
  }
}
