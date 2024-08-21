// src/modules/aws/s3.service.ts
import { Injectable } from '@nestjs/common';
import * as AWS from 'aws-sdk';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class S3Service {
  private s3: AWS.S3;

  constructor(private configService: ConfigService) {
    this.s3 = new AWS.S3({
      accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
      region: this.configService.get<string>('AWS_REGION'),
    });
  }

  async uploadFile(
    file: Buffer,
    bucket: string,
    key: string,
    contentType: string,
  ): Promise<AWS.S3.ManagedUpload.SendData> {
    const params: AWS.S3.PutObjectRequest = {
      Bucket: bucket,
      Key: key,
      Body: file,
      ContentType: contentType,
      ACL: 'private',
    };
    console.log('Uploading file to S3:', params);

    return this.s3.upload(params).promise();
  }

  async getPresignedUrl(
    bucket: string,
    key: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const params = {
      Bucket: bucket,
      Key: key,
      Expires: expiresIn,
    };

    return this.s3.getSignedUrlPromise('getObject', params);
  }
}
