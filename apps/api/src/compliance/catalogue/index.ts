import { catalogueSchema } from "./schema";
import { catalogueV118 } from "./v1.18";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV118);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
