import { Injectable } from "@nestjs/common";
import { TRACKER_CATALOGUE } from "./index";
import type { TrackerCatalogue } from "./schema";
@Injectable()
export class TrackerCatalogueService {
  readonly catalogue: TrackerCatalogue = TRACKER_CATALOGUE;
}
