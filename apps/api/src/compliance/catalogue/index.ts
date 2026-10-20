import { catalogueSchema } from "./schema";
import { catalogueV121 } from "./v1.21";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV121);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
