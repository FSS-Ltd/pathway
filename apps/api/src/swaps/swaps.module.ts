import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { AuthModule } from "../auth/auth.module";
import { SwapsController } from "./swaps.controller";
import { SwapsService } from "./swaps.service";
import { RotaAccessService } from "../sessions/rota-access.service";

@Module({
  imports: [CommonModule, AuthModule],
  controllers: [SwapsController],
  providers: [SwapsService, RotaAccessService],
  exports: [SwapsService],
})
export class SwapsModule {}
