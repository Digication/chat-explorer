import { AppDataSource } from "../src/server/data-source.js";
import { Comment } from "../src/server/entities/Comment.js";
import { Thread } from "../src/server/entities/Thread.js";
import { CommentToriTag } from "../src/server/entities/CommentToriTag.js";
import { extractToriForThread } from "../src/server/services/tori-extractor.js";

async function main() {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();

  const threadRepo = AppDataSource.getRepository(Thread);
  const commentRepo = AppDataSource.getRepository(Comment);
  const cttRepo = AppDataSource.getRepository(CommentToriTag);

  // Clear existing (stale) TORI associations
  await cttRepo.clear();

  const threads = await threadRepo.find();
  let totalAssociations = 0;

  for (const thread of threads) {
    const comments = await commentRepo.find({ where: { threadId: thread.id } });
    const input = comments.map((c) => ({
      id: c.id,
      externalId: c.externalId,
      role: c.role,
      text: c.text,
      orderIndex: c.orderIndex,
    }));

    const associations = await extractToriForThread(input);

    for (const assoc of associations) {
      await cttRepo.save({
        commentId: assoc.studentCommentId,
        toriTagId: assoc.toriTagId,
        sourceCommentId: assoc.sourceCommentId,
      });
    }
    totalAssociations += associations.length;
  }

  console.log(
    `Done. Processed ${threads.length} threads, created ${totalAssociations} TORI associations.`
  );
  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
