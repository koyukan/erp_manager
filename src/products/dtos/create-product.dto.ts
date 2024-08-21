import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  barcode: string;
  @IsString()
  @IsNotEmpty()
  name: string;
  @IsNumber()
  @IsNotEmpty()
  warehouse: number;
  @IsNumber()
  @IsNotEmpty()
  isle: number;
  @IsNumber()
  @IsNotEmpty()
  rack: number;
}
