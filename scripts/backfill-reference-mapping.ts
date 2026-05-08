import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function addReference(mapping: unknown): Record<string, string> | null {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) return null;
  const m = mapping as Record<string, string>;
  if (m.reference) return null; // already has it — skip
  return { ...m, reference: "T" };
}

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, sheetMapping: true, sheetProfiles: true },
  });

  let updated = 0;

  for (const user of users) {
    const patch: Record<string, unknown> = {};

    // Patch top-level sheetMapping
    const newMapping = addReference(user.sheetMapping);
    if (newMapping) patch.sheetMapping = newMapping;

    // Patch each profile's sheetMapping
    const profiles = user.sheetProfiles as any[] | null;
    if (Array.isArray(profiles) && profiles.length > 0) {
      let profilesChanged = false;
      const patchedProfiles = profiles.map((p: any) => {
        const nm = addReference(p.sheetMapping);
        if (!nm) return p;
        profilesChanged = true;
        return { ...p, sheetMapping: nm };
      });
      if (profilesChanged) patch.sheetProfiles = patchedProfiles;
    }

    if (Object.keys(patch).length === 0) continue;

    await prisma.user.update({ where: { id: user.id }, data: patch });
    updated++;
    console.log(`✓ ${user.id}`);
  }

  console.log(`\nDone — updated ${updated} / ${users.length} users`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
