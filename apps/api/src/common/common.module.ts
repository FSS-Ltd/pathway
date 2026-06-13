import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PathwayAuthModule } from "@pathway/auth";
import { TenantRlsInterceptor } from "./database/tenant-rls.interceptor";
import { LoggingService } from "./logging/logging.service";
import { SupabaseStorageService } from "./storage/supabase-storage.service";

@Module({
  imports: [PathwayAuthModule],
  providers: [
    LoggingService,
    SupabaseStorageService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantRlsInterceptor,
    },
  ],
  exports: [PathwayAuthModule, LoggingService, SupabaseStorageService],
})
export class CommonModule {}
