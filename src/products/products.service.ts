import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { CreateProductDto } from './dtos/create-product.dto';
import { User } from '../users/user.entity';
import { S3Service } from '../aws/s3.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private repo: Repository<Product>,
    private s3Service: S3Service,
    private configService: ConfigService,
    private logger: Logger,
  ) {}

  create(productDto: CreateProductDto, user: User) {
    const product = this.repo.create(productDto);
    product.user = user;

    return this.repo.save(product);
  }

  async updateProduct(barcode: string, attrs: Partial<Product>) {
    const product = await this.repo.findOne({ where: { barcode } });
    if (!product) {
      throw new NotFoundException('Product not found, cannot update');
    }

    Object.assign(product, attrs);

    return await this.repo.save(product);
  }

  async getProduct(barcode: string) {
    const product = await this.repo.findOne({ where: { barcode } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    this.logger.log('Fetching product');

    if (product.imageUrl) {
      const bucket = this.configService.get<string>('AWS_S3_BUCKET');
      const key = product.imageUrl.split('/').slice(3).join('/'); // Assumes URL format: https://bucket-name.s3.region.amazonaws.com/key
      const presignedUrl = await this.s3Service.getPresignedUrl(bucket, key);
      return { ...product, imageUrl: presignedUrl };
    }

    return product;
  }

  async uploadProductImage(barcode: string, file: Express.Multer.File) {
    const product = await this.repo.findOne({ where: { barcode } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const bucket = process.env.AWS_S3_BUCKET;
    const key = `products/${barcode}/${file.originalname}`;

    const result = await this.s3Service.uploadFile(
      file.buffer,
      bucket,
      key,
      file.mimetype,
    );

    product.imageUrl = result.Location;
    return this.repo.save(product);
  }
}
