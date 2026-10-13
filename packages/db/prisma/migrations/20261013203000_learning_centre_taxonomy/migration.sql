-- Additive identity values; existing organisations and historical orders are unchanged.
ALTER TYPE "OrgSector" ADD VALUE IF NOT EXISTS 'LEARNING_CENTRE';
ALTER TYPE "Vertical" ADD VALUE IF NOT EXISTS 'ACE_LEARNING_CENTRE';
ALTER TYPE "Vertical" ADD VALUE IF NOT EXISTS 'PUBLIC_LEARNING_CENTRE';
