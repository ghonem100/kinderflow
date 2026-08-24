/**
 * KF-S0-RLS-001 — acceptance criterion 6: module-author ergonomics.
 *
 * This is what a repository looks like under the chosen pattern. Read it and
 * count the tenant references: there are none. No `tenantId` parameter, no
 * `where: { tenantId }`, no `data: { tenantId }`, no context lookup, nothing to
 * forget. The tenant is ambient, injected by the extension, and enforced by
 * PostgreSQL underneath.
 *
 * That is the point. A rule module authors must remember is a rule that will
 * eventually be forgotten in one place, and one place is all it takes.
 */

interface ChildRow {
  id: string;
  fullName: string;
}

interface Delegate {
  findMany: (args?: unknown) => Promise<unknown[]>;
  create: (args?: unknown) => Promise<unknown>;
  count: (args?: unknown) => Promise<number>;
}

interface Db {
  spikeChild: Delegate;
  spikeAttendanceEvent: Delegate;
}

/**
 * A perfectly ordinary repository. It is tenant-safe because of where it runs,
 * not because of anything it does.
 */
export class ChildRepository {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async listRoster(limit = 50): Promise<ChildRow[]> {
    return (await this.db.spikeChild.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, fullName: true },
    })) as ChildRow[];
  }

  async findByName(fragment: string): Promise<ChildRow[]> {
    return (await this.db.spikeChild.findMany({
      where: { fullName: { contains: fragment } },
      select: { id: true, fullName: true },
    })) as ChildRow[];
  }

  async enrol(fullName: string): Promise<ChildRow> {
    return (await this.db.spikeChild.create({
      data: { fullName },
    })) as ChildRow;
  }

  async recordCheckIn(childId: string): Promise<void> {
    await this.db.spikeAttendanceEvent.create({
      data: { childId, direction: 'CHECK_IN' },
    });
  }

  async rosterSize(): Promise<number> {
    return this.db.spikeChild.count();
  }
}

/*
 * Call site, for contrast — the ONLY place tenancy is mentioned:
 *
 *   await withTenant(prisma, req.auth.tenantId, async () => {
 *     const repo = new ChildRepository(db);
 *     return repo.listRoster();
 *   });
 *
 * `req.auth.tenantId` comes from the verified JWT, server-side. It is never
 * read from a request body or query string — see ADR-010, "Trust boundary".
 */
