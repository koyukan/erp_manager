import {
  IsString,
  IsNumber,
  Min,
  Max,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
} from 'class-validator';

export class CreateReportDto {
  @IsString()
  @IsNotEmpty()
  make: string;
  @IsString()
  @IsNotEmpty()
  model: string;
  @IsNumber()
  @IsNotEmpty()
  @Min(1910)
  @Max(2025)
  year: number;
  @IsNumber()
  @Min(0)
  @Max(1000000)
  @IsNotEmpty()
  mileage: number;
  @IsLatitude()
  @IsNotEmpty()
  lat: number;
  @IsLongitude()
  @IsNotEmpty()
  lng: number;
  @IsNumber()
  @Min(0)
  @Max(1000000)
  @IsNotEmpty()
  price: number;
}
