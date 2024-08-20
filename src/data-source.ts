import { DataSource } from 'typeorm';
import * as path from 'path';

const env = process.env.NODE_ENV || 'dev';

let dataSourceOptions;

switch (env) {
  case 'dev':
    dataSourceOptions = {
      type: 'sqlite',
      database: process.env.DB_NAME || 'db.sqlite',
      entities: [path.join(__dirname, '**', '*.entity.ts')],
      migrations: [path.join(__dirname, 'migrations', '*-dev-*.ts')],
      migrationsRun: true,
      logging: true,
    };
    break;

  case 'test':
    dataSourceOptions = {
      type: 'sqlite',
      database: process.env.DB_NAME || 'test.sqlite',
      entities: [path.join(__dirname, '..', 'src', '**', '*.entity.ts')],
      migrations: [
        path.join(__dirname, '..', 'src', 'migrations', '*-dev-*.ts'),
      ],
      migrationsRun: true,
      logging: true,
    };
    break;

  case 'prod':
    dataSourceOptions = {
      type: 'postgres',
      url: process.env.DATABASE_URL || '',
      entities: [path.join(__dirname, '**', '*.entity.ts')],
      migrations: [path.join(__dirname, 'migrations', '*-prod-*.ts')],
      migrationsRun: true,
      logging: true,
      ssl: {
        rejectUnauthorized: false,
      },
    };
    break;

  default:
    throw new Error('Invalid NODE_ENV');
}

export const appDataSource = new DataSource(dataSourceOptions);
