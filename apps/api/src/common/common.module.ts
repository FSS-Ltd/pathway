import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PathwayAuthModule } from "@pathway/auth";
import { TenantRlsInterceptor } from "./database/tenant-rls.interceptor";
import { LoggingService } from "./logging/logging.service";
import { SupabaseStorageService } from "./storage/supabase-storage.service";
import { OutboxModule } from "./outbox/outbox.module";

@Module({
  imports: [PathwayAuthModule, OutboxModule],
  providers: [
    LoggingService,
    SupabaseStorageService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantRlsInterceptor,
    },
  ],
  exports: [
    PathwayAuthModule,
    LoggingService,
    OutboxModule,
    SupabaseStorageService,
  ],
})
export class CommonModule {}
