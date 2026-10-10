-- CreateEnum
CREATE TYPE "ConversationAiMode" AS ENUM ('MANUAL', 'SUGGEST', 'AUTO');

-- AlterTable
ALTER TABLE "AIDecision" ALTER COLUMN "confidence" DROP NOT NULL,
ALTER COLUMN "confidence" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "aiMode" "ConversationAiMode" NOT NULL DEFAULT 'AUTO';

-- Conversations a human already took over keep AI drafting suggestions only.
UPDATE "Conversation" SET "aiMode" = 'SUGGEST' WHERE "handler" = 'HUMAN';
