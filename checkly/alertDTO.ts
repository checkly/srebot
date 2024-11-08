import { Transform } from 'class-transformer';
import {
  IsString,
  IsUUID,
  IsNumber,
  IsArray,
  IsOptional,
} from 'class-validator';

export class AlertDto {
  @IsString()
  CHECK_NAME: string;

  @IsUUID()
  CHECK_ID: string;
  @IsUUID()
  $UUID: string;

  @IsString()
  CHECK_TYPE: string;

  @IsString()
  GROUP_NAME: string;

  @IsString()
  ALERT_TITLE: string;

  @IsString()
  ALERT_TYPE: string;

  @IsUUID()
  CHECK_RESULT_ID: string;

  @IsNumber()
  RESPONSE_TIME: number;

  @IsOptional() // This is optional because it's only for API checks
  @IsNumber()
  API_CHECK_RESPONSE_STATUS_CODE?: number;

  @IsOptional() // This is optional because it's only for API checks
  @IsString()
  API_CHECK_RESPONSE_STATUS_TEXT?: string;

  @IsString()
  RUN_LOCATION: string;

  @IsString()
  RESULT_LINK: string;

  @IsOptional() // This is only for ALERT_SSL alerts
  @IsNumber()
  SSL_DAYS_REMAINING?: number;

  @IsOptional() // This is only for ALERT_SSL alerts
  @IsString()
  SSL_CHECK_DOMAIN?: string;

  @IsString()
  STARTED_AT: string;

  @Transform(({ value }) => {
    try {
      if (!value) {
        return [];
      }
      console.log('jsonarray:' + value);
      // If the value is a valid stringified JSON array, parse it
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;

      // Return the value only if it's a valid array, otherwise return an empty array
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      if (e instanceof SyntaxError) {
        return [value];
      }
      // If parsing fails, return an empty array
      console.trace(e);
      return [];
    }
  })
  @IsArray() // Assuming TAGS is an array of strings
  @IsString({ each: true })
  TAGS: string[];

  @IsNumber()
  $RANDOM_NUMBER: number;

  @IsString()
  moment: string;
}
