import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { DomainError } from "@reviewguard/core";
import { ZodError } from "zod";

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host
      .switchToHttp()
      .getResponse<{ status: (code: number) => { send: (body: unknown) => void } }>();
    if (exception instanceof DomainError) {
      response
        .status(exception.statusCode)
        .send({ error: exception.code, message: exception.message });
      return;
    }
    if (exception instanceof ZodError) {
      response.status(400).send({
        error: "validation_error",
        message: "Request validation failed",
        issues: exception.issues,
      });
      return;
    }
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).send(exception.getResponse());
      return;
    }
    console.error("unhandled_api_error", exception instanceof Error ? exception.name : "unknown");
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .send({ error: "internal_error", message: "Unexpected server error" });
  }
}
