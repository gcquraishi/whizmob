export interface Passport {
  id: string;
  name: string;
  type: string;
  platform: string;
  purpose: string;
  model_hint: string | null;
  tags: string[];
  scope: string;
  metadata_json: string;
}

export interface DedupGroup {
  canonicalName: string;
  reason: 'exact-name' | 'core-slug';
  members: Passport[];
  differingFields: string[];
}

export interface DedupResult {
  groups: DedupGroup[];
  ungroupedCount: number;
}

const TYPE_PREFIXES = ['agent-', 'skill-', 'cursor-skill-', 'codex-skill-'];

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

function coreSlug(id: string, projectNames: Set<string>): string {
  let slug = id.toLowerCase();
  for (const prefix of TYPE_PREFIXES) {
    if (slug.startsWith(prefix)) {
      slug = slug.slice(prefix.length);
      break;
    }
  }
  for (const proj of projectNames) {
    const projPrefix = proj.toLowerCase() + '-';
    if (slug.startsWith(projPrefix)) {
      slug = slug.slice(projPrefix.length);
      break;
    }
  }
  return slug;
}

function findDifferingFields(members: Passport[]): string[] {
  const fields: (keyof Passport)[] = ['platform', 'scope', 'purpose', 'model_hint', 'type'];
  const differing: string[] = [];
  for (const field of fields) {
    const values = new Set(members.map(m => String(m[field] ?? '')));
    if (values.size > 1) {
      differing.push(field);
    }
  }
  return differing;
}

export function computeDedupGroups(passports: Passport[]): DedupResult {
  const projectNames = new Set(
    passports
      .filter(p => p.type === 'project')
      .map(p => p.name)
  );

  // Pass 1: exact name match
  const nameGroups = new Map<string, Passport[]>();
  for (const p of passports) {
    const key = normalizeName(p.name);
    const group = nameGroups.get(key);
    if (group) {
      group.push(p);
    } else {
      nameGroups.set(key, [p]);
    }
  }

  // Pass 2: core slug match
  const slugGroups = new Map<string, Passport[]>();
  for (const p of passports) {
    const key = coreSlug(p.id, projectNames);
    const group = slugGroups.get(key);
    if (group) {
      group.push(p);
    } else {
      slugGroups.set(key, [p]);
    }
  }

  // Merge: use union-find by passport id
  const parent = new Map<string, string>();
  function find(id: string): string {
    if (!parent.has(id)) parent.set(id, id);
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const members of nameGroups.values()) {
    if (members.length > 1) {
      for (let i = 1; i < members.length; i++) {
        union(members[0].id, members[i].id);
      }
    }
  }
  for (const members of slugGroups.values()) {
    if (members.length > 1) {
      for (let i = 1; i < members.length; i++) {
        union(members[0].id, members[i].id);
      }
    }
  }

  // Collect merged groups
  const merged = new Map<string, Passport[]>();
  for (const p of passports) {
    const root = find(p.id);
    const group = merged.get(root);
    if (group) {
      group.push(p);
    } else {
      merged.set(root, [p]);
    }
  }

  // Filter to groups with 2+ members, determine reason
  const groups: DedupGroup[] = [];
  let ungroupedCount = 0;

  for (const members of merged.values()) {
    if (members.length < 2) {
      ungroupedCount++;
      continue;
    }

    const names = new Set(members.map(m => normalizeName(m.name)));
    const reason: DedupGroup['reason'] = names.size === 1 ? 'exact-name' : 'core-slug';
    const canonicalName = members[0].name;

    groups.push({
      canonicalName,
      reason,
      members,
      differingFields: findDifferingFields(members),
    });
  }

  groups.sort((a, b) => b.members.length - a.members.length);

  return { groups, ungroupedCount };
}
