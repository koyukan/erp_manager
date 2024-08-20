import { IsBoolean } from 'class-validator';

export class ApprioveReportDto {
  @IsBoolean()
  approved: boolean;
}
