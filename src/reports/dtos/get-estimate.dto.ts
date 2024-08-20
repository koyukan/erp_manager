import {
  IsString,
  IsNumber,
  Min,
  Max,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
} from 'class-validator';

import { Transform } from 'class-transformer';

export class GetEstimateDto {
  @IsString()
  @IsNotEmpty()
  make: string;
  @IsString()
  @IsNotEmpty()
  model: string;

  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @IsNotEmpty()
  @Min(1910)
  @Max(2025)
  year: number;

  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(0)
  @Max(1000000)
  @IsNotEmpty()
  mileage: number;

  @Transform(({ value }) => parseFloat(value))
  @IsLatitude()
  @IsNotEmpty()
  lat: number;

  @Transform(({ value }) => parseFloat(value))
  @IsLongitude()
  @IsNotEmpty()
  lng: number;
}
