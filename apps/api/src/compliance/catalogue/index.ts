import { catalogueSchema } from "./schema";
import { catalogueV131 } from "./v1.31";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV131);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
