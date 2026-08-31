import { Test, TestingModule } from '@nestjs/testing';
import { CitizenController } from './citizen.controller';

describe('CitizenController', () => {
  let controller: CitizenController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CitizenController],
    }).compile();

    controller = module.get<CitizenController>(CitizenController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
