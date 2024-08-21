import {
  Controller,
  Post,
  Body,
  UseGuards,
  Patch,
  Param,
  Get,
  UseInterceptors,
  UploadedFile,
  Logger,
} from '@nestjs/common';
import { CreateProductDto } from './dtos/create-product.dto';
import { ProductsService } from './products.service';
import { AuthGuard } from '../guards/auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { ProductDto } from './dtos/product.dto';
import { Serialize } from '../interceptors/serialize.interceptor';
import { AdminGuard } from '../guards/admin.guard';
import { UpdateProductDto } from './dtos/update-product.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('products')
export class ProductsController {
  constructor(
    private ProductsService: ProductsService,
    private readonly logger: Logger,
  ) {}
  @UseGuards(AuthGuard)
  @Serialize(ProductDto)
  @Post('/create')
  createProduct(@Body() body: CreateProductDto, @CurrentUser() user: User) {
    return this.ProductsService.create(body, user);
  }

  @UseGuards(AdminGuard)
  @Patch('/:barcode')
  updateProduct(
    @Param('barcode') barcode: string,
    @Body() attrs: UpdateProductDto,
  ) {
    this.logger.log('Updating product', 'ProductsController');
    return this.ProductsService.updateProduct(barcode, attrs);
  }
  @UseGuards(AuthGuard)
  @Get('/:barcode')
  async getProduct(@Param('barcode') barcode: string) {
    const user = await this.ProductsService.getProduct(barcode);
    return user;
  }
  @UseGuards(AuthGuard)
  @Post(':barcode/image')
  @UseInterceptors(FileInterceptor('file'))
  uploadProductImage(
    @Param('barcode') barcode: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.ProductsService.uploadProductImage(barcode, file);
  }
}
