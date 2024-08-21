import { Expose, Transform } from 'class-transformer';

export class ProductDto {
  @Expose()
  barcode: string;
  @Expose()
  name: string;
  @Expose()
  warehouse: number;
  @Expose()
  isle: number;
  @Expose()
  rack: number;
  @Transform(({ obj }) => obj.user.id)
  @Expose()
  userId: number;
}
