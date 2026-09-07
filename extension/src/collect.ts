/* Injected into the Canvas tab. Returns the term's data as a plain object.
 * Same-origin, session-authenticated, read-only.
 */
export {};   // module scope so TypeScript treats this as its own file

interface Paged { [k: string]: any }

(async () => {
  const api = async (path: string, soft?: boolean): Promise<Paged[]> => {
    let url: string | null = path.startsWith('http') ? path : location.origin + path;
    const out: Paged[] = [];
    while (url) {
      let res: Response;
      try {
        res = await fetch(url, { credentials: 'include',
                                 headers: { Accept: 'application/json' } });
      } catch { break; }
      if (!res.ok) break;
      const body = await res.json();
      Array.isArray(body) ? out.push(...body) : out.push(body);
      const link = res.headers.get('Link') || '';
      const next = link.split(',').find((s: string) => s.includes('rel="next"'));
      url = next ? next.slice(next.indexOf('<') + 1, next.indexOf('>')) : null;
    }
    return out;
  };

  const HINT = /syllab|course\s*info|policies|grading|overview|expectations/i;

  const courses = await api('/api/v1/courses?enrollment_state=active&per_page=100'
                          + '&include[]=term&include[]=total_scores');
  if (!courses.length) return { error: 'not signed in to Canvas' };

  const term = Math.max(...courses.map((c: Paged) => c.enrollment_term_id || 0));
  const current = courses.filter((c: Paged) => c.enrollment_term_id === term);

  const out = {
    collected_at: new Date().toISOString(),
    host: location.origin,
    term,
    collector_version: 2,
    courses: [] as Paged[],
  };

  for (const c of current) {
    const [full, groups, assignments, enrollments, submissions, pages, files, frontPage] =
      await Promise.all([
        api(`/api/v1/courses/${c.id}?include[]=syllabus_body`),
        api(`/api/v1/courses/${c.id}/assignment_groups?include[]=assignments&per_page=100`),
        api(`/api/v1/courses/${c.id}/assignments?per_page=100`),
        api(`/api/v1/courses/${c.id}/enrollments?user_id=self&per_page=100`),
        api(`/api/v1/courses/${c.id}/students/submissions?student_ids[]=self&include[]=assignment&per_page=100`),
        api(`/api/v1/courses/${c.id}/pages?per_page=100`, true),
        api(`/api/v1/courses/${c.id}/files?per_page=100`, true),
        api(`/api/v1/courses/${c.id}/front_page`, true),
      ]);

    const bodies: Array<{title: string; url: string; body: string}> = [];
    for (const p of pages.filter((p: Paged) => HINT.test(p.title || '')).slice(0, 8)) {
      const [fp] = await api(`/api/v1/courses/${c.id}/pages/${encodeURIComponent(p.url)}`, true);
      if (fp && fp.body) bodies.push({ title: fp.title, url: fp.url, body: fp.body });
    }
    if (frontPage[0] && frontPage[0].body) {
      bodies.push({ title: frontPage[0].title || 'Front Page', url: 'front_page',
                    body: frontPage[0].body });
    }

    out.courses.push({
      id: c.id, name: c.name, course_code: c.course_code,
      apply_assignment_group_weights: c.apply_assignment_group_weights,
      syllabus_body: (full[0] || {}).syllabus_body || null,
      syllabus_pages: bodies,
      syllabus_files: files.filter((f: Paged) => HINT.test(f.display_name || f.filename || ''))
                           .map((f: Paged) => ({ name: f.display_name || f.filename, url: f.url })),
      assignment_groups: groups, assignments, enrollments, submissions,
    });
  }
  return out;
})();
