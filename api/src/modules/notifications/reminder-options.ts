import { BadRequestException } from '@nestjs/common'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Max,
  Min,
  ValidateIf,
} from 'class-validator'

const MINUTE_MS = 60_000

export class ReminderOptionsDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(28 * 24 * 60, { each: true })
  reminderOffsets?: number[]
}

export function reminderTime(start: Date, minutes: number): number {
  return start.getTime() - minutes * MINUTE_MS
}

export function validateReminderTimes(
  start: Date | null,
  offsets: number[] | null | undefined,
  previousStart?: Date | null,
  previousOffsets: number[] = [],
): void {
  if (!offsets?.length) return
  const now = Date.now()
  const sameStart = start?.getTime() === previousStart?.getTime()
  if (
    !start ||
    offsets.some(
      (minutes) =>
        reminderTime(start, minutes) <= now &&
        !(sameStart && previousOffsets.includes(minutes)),
    )
  ) {
    throw new BadRequestException(
      'Escolha lembretes com horário de envio no futuro.',
    )
  }
}
