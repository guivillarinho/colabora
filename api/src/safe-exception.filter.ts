import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common'
import type { Response } from 'express'
import { MulterError } from 'multer'

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError')
  catch(cause: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>()
    if (cause instanceof MulterError && cause.code === 'LIMIT_FILE_SIZE') {
      response.status(400).json({
        statusCode: 400,
        message: 'O arquivo deve ter no máximo 10 MB.',
      })
      return
    }
    if (cause instanceof HttpException) {
      const status = cause.getStatus()
      const body = cause.getResponse()
      response
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body }
            : body,
        )
      return
    }
    // Never log bodies, cookies, SQL parameters, hashes or infrastructure credentials.
    this.logger.error(
      `Falha interna: ${cause instanceof Error ? cause.name : 'UnknownError'}`,
    )
    response.status(500).json({
      statusCode: 500,
      message: 'Não foi possível concluir a solicitação.',
    })
  }
}
