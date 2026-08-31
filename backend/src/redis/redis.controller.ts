import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { RedisService } from './redis.service';

@Controller('redis')
export class RedisController {
  constructor(private readonly redisService: RedisService) {}

  @Post('set')
  async set(@Body() body: { key: string; value: string }) {
    await this.redisService.set(body.key, body.value);
    return {
      message: 'Data stored in Redis successfully',
    };
  }

  @Get('get/:key')
  async get(@Param('key') key: string) {
    const value = await this.redisService.get(key);

    return {
      key,
      value,
    };
  }

  @Delete(':key')
  async delete(@Param('key') key: string) {
    await this.redisService.del(key);

    return {
      message: 'Data deleted from Redis successfully',
    };
  }
}