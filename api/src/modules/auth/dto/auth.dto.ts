import { Transform } from 'class-transformer'
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator'

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string

  @IsString()
  @Length(1, 128)
  password: string
}

export class RegisterDto extends LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(2, 80)
  @Matches(/\S/)
  name: string

  @IsString()
  @Length(12, 128)
  declare password: string
}
