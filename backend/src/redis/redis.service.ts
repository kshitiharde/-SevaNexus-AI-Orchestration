import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: RedisClientType;

  constructor() {
    this.client = createClient({
      url: 'redis://localhost:6379',
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.connect().catch((err) => {
      console.error('Redis connection failed:', err);
    });
  }

  async set(key: string, value: string, expirationSeconds?: number) {
    if (expirationSeconds) {
      await this.client.set(key, value, {
        EX: expirationSeconds,
      });
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string) {
    return await this.client.get(key);
  }

  async del(key: string) {
    return await this.client.del(key);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}