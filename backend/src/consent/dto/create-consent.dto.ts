import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  IsOptional,
} from 'class-validator';

export class CreateConsentDto {
  @IsInt()
  @IsNotEmpty()
  citizenId: number;

  @IsInt()
  @IsNotEmpty()
  serviceId: number;

  @IsArray()
  @IsString({ each: true })
  scopes: string[];

  @IsOptional()
  @IsBoolean()
  granted?: boolean;
}