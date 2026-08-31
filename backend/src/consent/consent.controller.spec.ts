import { Test, TestingModule } from '@nestjs/testing';
import { ConsentController } from './consent.controller';

describe('ConsentController', () => {
  let controller: ConsentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConsentController],
    }).compile();

    controller = module.get<ConsentController>(ConsentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
