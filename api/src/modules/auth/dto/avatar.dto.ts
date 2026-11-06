import { IsIn, IsString, Matches } from 'class-validator'
import { AVATAR_PRESETS, type AvatarPreset, avatarFilename } from '../avatar'

export class SelectAvatarPresetDto {
  @IsIn(AVATAR_PRESETS)
  preset: AvatarPreset
}

export class ConfirmAvatarDto {
  @IsString()
  @Matches(avatarFilename)
  filename: string
}
