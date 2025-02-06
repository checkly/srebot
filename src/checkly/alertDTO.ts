import { Transform } from 'class-transformer';
import { IsArray, IsDate, IsEnum, IsNumber, IsOptional, IsString, IsUUID, } from 'class-validator';

/**
 * Enum representing the different alert types.
 * See https://www.checklyhq.com/docs/alerting-and-retries/alert-states/#alert-states--transitions
 * for more details.
 * @enum {string}
 */
export enum AlertType {
  /**
   * Nothing to see here, keep moving.
   */
  NO_ALERT = 'NO_ALERT',

  /**
   * Send directly, if threshold is “alert after 1 failure”.
   */
  ALERT_DEGRADED = 'ALERT_DEGRADED',

  /**
   * Send directly, if threshold is “alert after 1 failure”.
   */
  ALERT_FAILURE = 'ALERT_FAILURE',

  /**
   * i.e. when threshold is “alert after 2 failures” or “after 5 minutes”.
   */
  ALERT_DEGRADED_REMAIN = 'ALERT_DEGRADED_REMAIN',

  /**
   * Send but only if you received a degraded notification before.
   */
  ALERT_DEGRADED_RECOVERY = 'ALERT_DEGRADED_RECOVERY',

  /**
   * This is an escalation, it overrides any threshold setting. We send this even if you already received degraded notifications.
   */
  ALERT_DEGRADED_FAILURE = 'ALERT_DEGRADED_FAILURE',

  /**
   * i.e. when threshold is “alert after 2 failures” or “after 5 minutes”.
   */
  ALERT_FAILURE_REMAIN = 'ALERT_FAILURE_REMAIN',

  /**
   * This is a deescalation, it overrides any thresholds settings. We send this even if you already received failure notifications.
   */
  ALERT_FAILURE_DEGRADED = 'ALERT_FAILURE_DEGRADED',

  /**
   * Send directly.
   */
  ALERT_RECOVERY = 'ALERT_RECOVERY',
}


export class WebhookAlertDto {

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

  @IsEnum(AlertType)
  ALERT_TYPE: AlertType;

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

  @IsDate()
  STARTED_AT: Date;

  @Transform(({ value }) => {
    try {
      if (!value) {
        return [];
      }
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
