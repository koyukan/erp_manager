import { IsString, IsNumber, IsOptional } from 'class-validator';

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  name: string;
  @IsNumber()
  @IsOptional()
  warehouse: number;
  @IsNumber()
  @IsOptional()
  isle: number;
  @IsNumber()
  @IsOptional()
  rack: number;
}
