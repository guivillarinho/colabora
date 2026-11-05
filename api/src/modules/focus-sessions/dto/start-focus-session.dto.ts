import {
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

export class StartFocusSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  focusMinutes?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  breakMinutes?: number
}
