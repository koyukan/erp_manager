import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProcessorService } from './processor.service';
import { ProcessVideoDto } from './dto/process-video.dto';
import { v4 as uuidv4 } from 'uuid';
import { Serialize } from '../interceptors/serialize.interceptor';

@Controller('processor')
export class ProcessorController {
  private readonly logger = new Logger(ProcessorController.name);

  constructor(private readonly processorService: ProcessorService) {}

  @Post('process')
  @Serialize(ProcessVideoDto)
  @UseInterceptors(FileInterceptor('file'))
  async processVideo(
    @UploadedFile() file: Express.Multer.File,
    @Body() processVideoDto: ProcessVideoDto,
  ) {
    this.logger.debug('File Received');
    this.logger.debug(
      `Received file: ${file?.originalname}, size: ${file?.size}`,
    );
    this.logger.debug(`ProcessVideoDto: ${JSON.stringify(processVideoDto)}`);

    const processId = uuidv4();

    try {
      await this.processorService.processVideo(
        file,
        processVideoDto,
        processId,
      );
      this.logger.debug(`Process started with ID: ${processId}`);
      return { processId, message: 'Processing started' };
    } catch (error) {
      this.logger.error(
        `Error starting video process: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Get('progress/:id')
  async getProgress(@Param('id') id: string) {
    return this.processorService.getProgress(id);
  }

  @Get('result/:id')
  async getResult(@Param('id') id: string) {
    return this.processorService.getResult(id);
  }
}
