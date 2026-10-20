import { catalogueSchema } from "./schema";
import { catalogueV130 } from "./v1.30";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV130);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
