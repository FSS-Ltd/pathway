import { Module } from "@nestjs/common";
import { PathwayRequestContext } from "./context/pathway-request-context.service";

@Module({
  providers: [PathwayRequestContext],
  exports: [PathwayRequestContext],
})
export class PathwayAuthModule {}
