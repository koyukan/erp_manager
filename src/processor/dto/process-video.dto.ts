import { IsNumber, Min, Max, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class ProcessVideoDto {
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  startTime: number;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  endTime: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(32)
  @Transform(({ value }) => (value ? parseInt(value) : undefined))
  processes?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => (value ? parseInt(value) : undefined))
  batchSize?: number;
}
