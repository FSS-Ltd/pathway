import { catalogueSchema } from "./schema";
import { catalogueV136 } from "./v1.36";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV136);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
