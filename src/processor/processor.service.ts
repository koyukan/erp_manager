import { Injectable, Logger } from '@nestjs/common';
import { S3Service } from '../aws/s3.service';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ProcessVideoDto } from './dto/process-video.dto';

@Injectable()
export class ProcessorService {
  private readonly logger = new Logger(ProcessorService.name);
  private processes: Map<
    string,
    {
      process: any;
      progress: any;
      result: any;
    }
  > = new Map();

  constructor(private readonly s3Service: S3Service) {}

  async processVideo(
    file: Express.Multer.File,
    processVideoDto: ProcessVideoDto,
    processId: string,
  ): Promise<void> {
    this.logger.log(`Starting video processing with ID: ${processId}`);

    try {
      const inputPath = this.saveFile(file);
      const outputDir = this.createOutputDirectory(processId);

      const pythonProcess = this.spawnPythonProcess(
        inputPath,
        outputDir,
        processVideoDto,
      );

      this.processes.set(processId, {
        process: pythonProcess,
        progress: {},
        result: null,
      });

      this.handleProcessOutput(processId, pythonProcess);
    } catch (error) {
      this.logger.error(`Error in processVideo: ${error.message}`, error.stack);
      throw error;
    }
  }

  private saveFile(file: Express.Multer.File): string {
    const uploadDir = path.join(process.cwd(), 'uploads');
    fs.mkdirSync(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, `${uuidv4()}-${file.originalname}`);
    fs.writeFileSync(filePath, file.buffer);
    this.logger.debug(`File saved to ${filePath}`);
    return filePath;
  }

  getProgress(id: string): any {
    const processInfo = this.processes.get(id);
    if (!processInfo) {
      return { error: 'Process not found' };
    }
    return processInfo.progress;
  }

  getResult(id: string): any {
    const processInfo = this.processes.get(id);
    if (!processInfo) {
      return { error: 'Process not found' };
    }
    return processInfo.result;
  }

  private createOutputDirectory(processId: string): string {
    const outputDir = path.join(process.cwd(), 'output', processId);
    fs.mkdirSync(outputDir, { recursive: true });
    this.logger.debug(`Created output directory ${outputDir}`);
    return outputDir;
  }

  private spawnPythonProcess(
    inputPath: string,
    outputDir: string,
    processVideoDto: ProcessVideoDto,
  ) {
    const pythonProcess = spawn('python3', [
      'child_process.py',
      '--video',
      inputPath,
      '--start-time',
      processVideoDto.startTime.toString(),
      '--end-time',
      processVideoDto.endTime.toString(),
      '--processes',
      (processVideoDto.processes || 4).toString(),
      '--batch-size',
      (processVideoDto.batchSize || 1).toString(),
      '--output-dir',
      outputDir,
    ]);

    this.logger.debug(`Spawned Python process for ${inputPath}`);
    return pythonProcess;
  }

  private handleProcessOutput(processId: string, pythonProcess: any) {
    pythonProcess.stdout.on('data', (data) => {
      try {
        const jsonData = JSON.parse(data.toString());
        if (jsonData.status === 'completed') {
          this.handleCompletedProcess(processId, jsonData.output_files);
        } else {
          this.updateProgress(processId, jsonData);
        }
      } catch (error) {
        this.logger.warn(`Non-JSON output from Python process: ${data}`);
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      this.logger.error(`Python process error: ${data}`);
    });

    pythonProcess.on('close', (code) => {
      this.logger.log(`Python process exited with code ${code}`);
      this.cleanupProcess(processId);
    });
  }

  private updateProgress(processId: string, progressData: any) {
    const processInfo = this.processes.get(processId);
    if (processInfo) {
      processInfo.progress = progressData;
      this.logger.debug(
        `Updated progress for process ${processId}: ${JSON.stringify(progressData)}`,
      );
    }
  }

  private async handleCompletedProcess(processId: string, outputFiles: any) {
    this.logger.log(`Process ${processId} completed. Uploading results to S3.`);
    const s3Results = await this.uploadResultsToS3(processId, outputFiles);

    const processInfo = this.processes.get(processId);
    if (processInfo) {
      processInfo.result = s3Results;
      processInfo.progress = { status: 'completed' };
    }

    this.cleanupLocalFiles(outputFiles);
  }

  private async uploadResultsToS3(processId: string, outputFiles: any) {
    const s3Results = {};
    for (const [key, filePath] of Object.entries(outputFiles)) {
      const fileContent = fs.readFileSync(filePath as string);
      const s3Key = `results/${processId}/${path.basename(filePath as string)}`;
      await this.s3Service.uploadFile(
        fileContent,
        process.env.AWS_S3_BUCKET,
        s3Key,
        this.getContentType(key),
      );
      s3Results[key] = s3Key;
    }
    return s3Results;
  }

  private getContentType(fileType: string): string {
    switch (fileType) {
      case 'csv':
        return 'text/csv';
      case 'json':
        return 'application/json';
      case 'video':
        return 'video/mp4';
      default:
        return 'application/octet-stream';
    }
  }

  private cleanupLocalFiles(files: any) {
    Object.values(files).forEach((filePath: string) => {
      fs.unlinkSync(filePath);
      this.logger.debug(`Deleted local file: ${filePath}`);
    });
  }

  private cleanupProcess(processId: string) {
    const processInfo = this.processes.get(processId);
    if (processInfo && processInfo.process) {
      processInfo.process.kill();
    }
    // Keep the result in memory for a while, could implement a cleanup strategy later
    // this.processes.delete(processId);
  }
}
