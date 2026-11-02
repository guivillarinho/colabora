import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class PushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  endpoint: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  p256dh: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  auth: string
}

export class RemovePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  endpoint: string
}
