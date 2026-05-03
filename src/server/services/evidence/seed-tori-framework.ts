import { AppDataSource } from "../../data-source.js";
import {
  OutcomeFramework,
  FrameworkType,
} from "../../entities/OutcomeFramework.js";
import { OutcomeDefinition } from "../../entities/OutcomeDefinition.js";
import { ToriTag } from "../../entities/ToriTag.js";
import { Institution } from "../../entities/Institution.js";

/**
 * Seeds a TORI OutcomeFramework for every institution that doesn't have one.
 * Called during server startup after seedToriTags(). Idempotent.
 */
export async function seedToriFrameworks(): Promise<void> {
  const institutions = await AppDataSource.getRepository(Institution).find({
    select: ["id"],
  });
  for (const inst of institutions) {
    await seedToriFrameworkForInstitution(inst.id);
  }
}

async function seedToriFrameworkForInstitution(
  institutionId: string
): Promise<void> {
  const frameworkRepo = AppDataSource.getRepository(OutcomeFramework);
  const existing = await frameworkRepo.findOne({
    where: { institutionId, type: FrameworkType.TORI },
  });
  if (existing) return;

  const framework = await frameworkRepo.save(
    frameworkRepo.create({
      institutionId,
      name: "TORI Learning Outcomes",
      description: "Transformative Outcomes Research Institute taxonomy",
      type: FrameworkType.TORI,
      isDefault: true,
      isSystem: true,
    })
  );

  const toriTags = await AppDataSource.getRepository(ToriTag).find({
    order: { domainNumber: "ASC", categoryNumber: "ASC" },
  });

  const outcomeRepo = AppDataSource.getRepository(OutcomeDefinition);
  for (const tag of toriTags) {
    const catNum = tag.categoryNumber ?? "0";
    const sortVal = tag.domainNumber * 100 + (parseInt(catNum, 10) || 0);
    await outcomeRepo.save(
      outcomeRepo.create({
        frameworkId: framework.id,
        code: `TORI-${tag.domainNumber}-${catNum}`,
        name: tag.name,
        description: tag.description,
        sortOrder: sortVal,
      })
    );
  }

  console.log(
    `[seed] TORI framework seeded for institution ${institutionId} (${toriTags.length} outcomes)`
  );
}
