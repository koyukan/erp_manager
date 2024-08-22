// src/processor/processor.module.ts
import { Module } from '@nestjs/common';
import { ProcessorController } from './processor.controller';
import { ProcessorService } from './processor.service';
import { AwsModule } from '../aws/aws.module'; // Assuming you have an AWS module
import { Logger } from '@nestjs/common';

@Module({
  imports: [AwsModule],
  controllers: [ProcessorController],
  providers: [ProcessorService, Logger],
})
export class ProcessorModule {}
