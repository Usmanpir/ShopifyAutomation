-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "lastMessageDirection" "MessageDirection";

-- Backfill from each conversation's latest message.
UPDATE "Conversation" c SET "lastMessageDirection" = m.direction
FROM (
  SELECT DISTINCT ON ("conversationId") "conversationId", direction
  FROM "Message" WHERE sender <> 'SYSTEM'
  ORDER BY "conversationId", "createdAt" DESC
) m
WHERE m."conversationId" = c.id;
