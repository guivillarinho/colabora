import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Patch,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Request } from 'express'
import { memoryStorage } from 'multer'
import { CurrentUser } from './auth.decorators'
import { AvatarService } from './avatar.service'
import { ConfirmAvatarDto, SelectAvatarPresetDto } from './dto/avatar.dto'
import type { Identity } from './entities/user.entity'
import { AVATAR_MAX_BYTES } from './avatar'

@Controller('users/me/avatar')
export class AvatarController {
  constructor(private readonly avatars: AvatarService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  async image(@CurrentUser() user: Identity) {
    const file = await this.avatars.open(user.id)
    return new StreamableFile(file.stream, {
      type: file.contentType,
      disposition: `inline; filename="${file.downloadName}"`,
    })
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
    }),
  )
  upload(
    @UploadedFile() file: { buffer?: Buffer; size?: number } | undefined,
    @CurrentUser() user: Identity,
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Selecione uma foto.')
    return this.avatars
      .saveLocal(user.id, file.buffer)
      .then((saved) => ({ user: saved }))
  }

  @Patch()
  select(@Body() dto: SelectAvatarPresetDto, @CurrentUser() user: Identity) {
    return this.avatars
      .selectPreset(user.id, dto.preset)
      .then((saved) => ({ user: saved }))
  }

  @Delete()
  @HttpCode(200)
  remove(@CurrentUser() user: Identity) {
    return this.avatars.clear(user.id).then((saved) => ({ user: saved }))
  }

  @Post('upload-token')
  uploadToken(
    @Body() body: HandleUploadBody,
    @Req() request: Request,
    @CurrentUser() user: Identity,
  ) {
    return handleUpload({
      body,
      request,
      onBeforeGenerateToken: (pathname) =>
        this.avatars.authorizeDirectUpload(user.id, pathname),
    })
  }

  @Post('confirm')
  confirm(@Body() dto: ConfirmAvatarDto, @CurrentUser() user: Identity) {
    return this.avatars
      .confirmDirectUpload(user.id, dto.filename)
      .then((saved) => ({ user: saved }))
  }
}
