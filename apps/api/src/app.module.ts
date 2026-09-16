import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthenticationGuard, RolesGuard } from "./auth.js";
import {
  AuditController,
  AutomationController,
  DevicesController,
  GoogleWebhookController,
  HealthController,
  IntegrationsController,
  InternalReviewsController,
  KnowledgeController,
  ReviewsController,
} from "./controllers.js";
import { DocumentsController } from "./documents.controller.js";
import { IdentityAccountVerifier } from "./identity-account.js";
import { IntegrationService } from "./integration.service.js";
import { KnowledgeService } from "./knowledge.service.js";
import { ReviewNotificationService } from "./notifications.js";
import { aiProvider, googleGateway } from "./providers.js";
import { ReviewService } from "./review.service.js";
import { MemoryStore } from "./store.js";
import { PublishTaskScheduler } from "./tasks.js";
import { WorkspaceController } from "./workspace.controller.js";

@Module({
  controllers: [
    HealthController,
    InternalReviewsController,
    ReviewsController,
    KnowledgeController,
    AutomationController,
    AuditController,
    DevicesController,
    IntegrationsController,
    GoogleWebhookController,
    WorkspaceController,
    DocumentsController,
  ],
  providers: [
    MemoryStore,
    ReviewService,
    ReviewNotificationService,
    PublishTaskScheduler,
    IntegrationService,
    IdentityAccountVerifier,
    KnowledgeService,
    aiProvider,
    googleGateway,
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
