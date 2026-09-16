import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { assertStartupConfiguration } from "./config.js";
import { HttpErrorFilter } from "./http-exception.filter.js";

export async function createApp() {
  assertStartupConfiguration();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger:
        process.env.NODE_ENV !== "test"
          ? {
              redact: [
                "req.headers.authorization",
                "req.headers.cookie",
                "req.headers.x-reviewguard-worker-secret",
              ],
            }
          : false,
      bodyLimit: 8_000_000,
    }),
  );
  app.setGlobalPrefix("v1");
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(","),
    credentials: true,
  });
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("ReviewGuard API")
      .setDescription("Human-controlled Google Business review reply workflow")
      .setVersion("1.0")
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup("docs", app, document, { jsonDocumentUrl: "openapi.json" });
  await app.init();
  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 4100);
  await app.listen(port, "0.0.0.0");
  console.info(`ReviewGuard API listening on http://localhost:${port}/v1`);
}
