import { Module, Logger } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { AwsModule } from '../aws/aws.module';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, Logger],
  imports: [TypeOrmModule.forFeature([Product]), AwsModule],
})
export class ProductsModule {}
