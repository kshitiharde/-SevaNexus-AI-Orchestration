import { IsInt, IsObject } from 'class-validator';

export class CreateApplicationDto {
  @IsInt()
  citizenId: number;

  @IsInt()
  serviceId: number;

  @IsObject()
  data: any;
}