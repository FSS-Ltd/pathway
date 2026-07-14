-- Sector selected once at initial plan purchase; drives which features are visible to the org.
CREATE TYPE "OrgSector" AS ENUM ('CHURCH', 'CLUB', 'SCHOOL', 'CHARITY');

ALTER TABLE "Org" ADD COLUMN "sector" "OrgSector";
