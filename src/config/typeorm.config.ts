import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import * as path from 'path';

@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    switch (this.configService.get<string>('NODE_ENV')) {
      case 'dev':
        return {
          type: 'sqlite',
          synchronize: false,
          database: this.configService.get<string>('DB_NAME'),
          entities: [path.join(__dirname, '..', '**', '*.entity.js')],
          migrations: [path.join(__dirname, '..', 'migrations', '*-dev-*.js')],
          migrationsRun: true,
          autoLoadEntities: true,
          logging: true,
        };
      case 'test':
        return {
          type: 'sqlite',
          synchronize: false,
          database: this.configService.get<string>('DB_NAME'),
          entities: [
            path.join(__dirname, '..', '..', 'src', '**', '*.entity.ts'),
          ],
          migrations: [
            path.join(__dirname, '..', '..', 'src', 'migrations', '*-dev-*.ts'),
          ],
          migrationsRun: true,
          autoLoadEntities: true,
          logging: true,
        };
      case 'prod':
        return {
          type: 'postgres',
          synchronize: false,
          url: this.configService.get<string>('DATABASE_URL'),
          entities: [path.join(__dirname, '..', '**', '*.entity.js')],
          migrations: [path.join(__dirname, '..', 'migrations', '*-prod-*.js')],
          migrationsRun: true,
          autoLoadEntities: true,
          logging: true,
          ssl: {
            rejectUnauthorized: false,
          },
        };
      default:
        throw new Error('Invalid NODE_ENV');
    }

    // const isTestEnv = this.configService.get<string>('NODE_ENV') === 'test';

    // const entitiesPattern = isTestEnv
    //   ? path.join(__dirname, '..', '..', 'src', '**', '*.entity.ts')
    //   : path.join(__dirname, '..', '**', '*.entity.js');

    // const migrationsPattern = isTestEnv
    //   ? path.join(__dirname, '..', '..', 'src', 'migrations', '*.ts')
    //   : path.join(__dirname, '..', 'migrations', '*.js');
    // console.log('Entities Pattern:', entitiesPattern);

    // const matchedEntities = glob.sync(entitiesPattern);
    // const matchedMigrations = glob.sync(migrationsPattern);

    // console.log('Matched Entities:', matchedEntities);
    // console.log('Matched Migrations:', matchedMigrations);
  }
}
