import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { BlogService } from "./blog.service";
import { BlogAdminController } from "./blog-admin.controller";
import { BlogPublicController } from "./blog-public.controller";
import { BlogMediaController } from "./blog-media.controller";
import { BlogAutomationController } from "./blog-automation.controller";
import { BlogAutomationTokenService } from "./blog-automation-token.service";
import { BlogAutomationTokenGuard } from "./blog-automation-token.guard";

@Module({
  imports: [CommonModule, AuthModule],
  controllers: [
    BlogAdminController,
    BlogPublicController,
    BlogMediaController,
    BlogAutomationController,
  ],
  providers: [BlogService, BlogAutomationTokenService, BlogAutomationTokenGuard],
  exports: [BlogService, BlogAutomationTokenService],
})
export class BlogModule {}
