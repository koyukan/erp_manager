import { IsNumber, Min, Max } from 'class-validator';

export class ProcessVideoDto {
  @IsNumber()
  @Min(0)
  startTime: number;

  @IsNumber()
  @Min(0)
  endTime: number;

  @IsNumber()
  @Min(1)
  @Max(32)
  processes?: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  batchSize?: number;
}
