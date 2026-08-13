import "dotenv/config";
import prisma from "../src/lib/db.js";

const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    clerkUserId: true,
    _count: { select: { workspaces: true, accounts: true, sessions: true } },
  },
  orderBy: { email: "asc" },
});

const grouped = new Map<string, typeof users>();
for (const user of users) {
  const email = user.email.trim().toLowerCase();
  grouped.set(email, [...(grouped.get(email) ?? []), user]);
}

const duplicateEmails = [...grouped.entries()]
  .filter(([, matches]) => matches.length > 1)
  .map(([email, matches]) => ({
    email,
    localUserIds: matches.map((user) => user.id),
  }));
const unlinked = users.filter((user) => !user.clerkUserId);
const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    users: users.length,
    linked: users.length - unlinked.length,
    unlinked: unlinked.length,
    workspaces: users.reduce((sum, user) => sum + user._count.workspaces, 0),
    legacyAccounts: users.reduce((sum, user) => sum + user._count.accounts, 0),
    legacySessions: users.reduce((sum, user) => sum + user._count.sessions, 0),
  },
  duplicateEmails,
  unlinked: unlinked.map((user) => ({
    localUserId: user.id,
    email: user.email,
    workspaces: user._count.workspaces,
  })),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (duplicateEmails.length > 0 || unlinked.length > 0) process.exitCode = 1;
await prisma.$disconnect();
