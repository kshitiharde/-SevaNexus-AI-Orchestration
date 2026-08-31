import { IsInt, IsNotEmpty } from 'class-validator';

export class CheckEligibilityDto {
  @IsInt()
  @IsNotEmpty()
  citizenId: number;

  @IsInt()
  @IsNotEmpty()
  serviceId: number;
}