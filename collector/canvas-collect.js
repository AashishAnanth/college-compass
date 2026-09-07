/* Canvas data collector (v2).
 *
 * Open a tab on your school's Canvas (e.g. https://<school>.instructure.com),
 * open DevTools -> Console, paste this whole file and press Enter. It pulls
 * everything for the current term using your own session and downloads one
 * JSON file.
 *
 * v2 also hunts for syllabi that aren't in the syllabus field: Canvas Pages,
 * the front page, module items, and uploaded files. Professors put them
 * everywhere except where the API expects.
 *
 * Read-only. No token, no password, nothing leaves your browser except the
 * file you save.
 */
(async () => {
  const api = async (path, { soft = false } = {}) => {
    let url = path.startsWith('http') ? path : location.origin + path;
    const out = [];
    while (url) {
      let res;
      try {
        res = await fetch(url, { credentials: 'include',
                                 headers: { Accept: 'application/json' } });
      } catch (e) { if (!soft) console.warn('  ! network', url); break; }
      if (!res.ok) {
        // 403 on /files is normal for students; don't make it look like a bug.
        if (!soft) console.warn('  !', res.status, url.replace(location.origin, ''));
        break;
      }
      const body = await res.json();
      Array.isArray(body) ? out.push(...body) : out.push(body);
      const link = res.headers.get('Link') || '';
      const next = link.split(',').find(s => s.includes('rel="next"'));
      url = next ? next.slice(next.indexOf('<') + 1, next.indexOf('>')) : null;
    }
    return out;
  };

  const SYLLABUS_HINT = /syllab|course\s*info|policies|grading|overview|expectations/i;

  console.log('fetching courses...');
  const courses = await api('/api/v1/courses?enrollment_state=active&per_page=100'
                          + '&include[]=term&include[]=total_scores');
  const term = Math.max(...courses.map(c => c.enrollment_term_id || 0));
  const current = courses.filter(c => c.enrollment_term_id === term);
  console.log(`term ${term}: ${current.length} of ${courses.length} courses`);

  const out = { collected_at: new Date().toISOString(), host: location.origin,
                term, collector_version: 2, courses: [] };

  for (const c of current) {
    console.log(`  ${c.course_code}`);
    const [full, groups, assignments, enrollments, submissions,
           pages, modules, files, frontPage] = await Promise.all([
      api(`/api/v1/courses/${c.id}?include[]=syllabus_body&include[]=public_description`),
      api(`/api/v1/courses/${c.id}/assignment_groups?include[]=assignments&per_page=100`),
      api(`/api/v1/courses/${c.id}/assignments?per_page=100`),
      api(`/api/v1/courses/${c.id}/enrollments?user_id=self&per_page=100`),
      api(`/api/v1/courses/${c.id}/students/submissions?student_ids[]=self`
        + `&include[]=assignment&per_page=100`),
      api(`/api/v1/courses/${c.id}/pages?per_page=100`, { soft: true }),
      api(`/api/v1/courses/${c.id}/modules?include[]=items&per_page=100`, { soft: true }),
      api(`/api/v1/courses/${c.id}/files?per_page=100`, { soft: true }),
      api(`/api/v1/courses/${c.id}/front_page`, { soft: true }),
    ]);

    // Fetch the body of any page that might be a syllabus (titles only give a hint).
    const wanted = pages.filter(p => SYLLABUS_HINT.test(p.title || '')).slice(0, 8);
    const bodies = [];
    for (const p of wanted) {
      const [full_page] = await api(
        `/api/v1/courses/${c.id}/pages/${encodeURIComponent(p.url)}`, { soft: true });
      if (full_page && full_page.body) {
        bodies.push({ title: full_page.title, url: full_page.url, body: full_page.body });
      }
    }
    if (frontPage[0] && frontPage[0].body) {
      bodies.push({ title: frontPage[0].title || 'Front Page',
                    url: 'front_page', body: frontPage[0].body });
    }

    // Files that look like a syllabus, plus anything linked from a module item.
    const fileHits = files
      .filter(f => SYLLABUS_HINT.test(f.display_name || f.filename || ''))
      .map(f => ({ name: f.display_name || f.filename, url: f.url,
                   type: f['content-type'] || f.content_type, size: f.size }));
    const moduleHits = [];
    for (const m of modules) {
      for (const it of (m.items || [])) {
        if (SYLLABUS_HINT.test(it.title || '')) {
          moduleHits.push({ module: m.name, title: it.title, type: it.type,
                            url: it.html_url, api: it.url });
        }
      }
    }

    const found = [];
    if ((full[0] || {}).syllabus_body) found.push('syllabus_body');
    if (bodies.length) found.push(`${bodies.length} page(s)`);
    if (fileHits.length) found.push(`${fileHits.length} file(s)`);
    if (moduleHits.length) found.push(`${moduleHits.length} module item(s)`);
    console.log(`      syllabus sources: ${found.length ? found.join(', ') : 'none found'}`);

    out.courses.push({
      id: c.id, name: c.name, course_code: c.course_code,
      apply_assignment_group_weights: c.apply_assignment_group_weights,
      syllabus_body: (full[0] || {}).syllabus_body || null,
      syllabus_pages: bodies,
      syllabus_files: fileHits,
      syllabus_module_items: moduleHits,
      page_titles: pages.map(p => p.title),
      assignment_groups: groups, assignments, enrollments, submissions,
    });
  }

  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `canvas-${term}-${Date.now()}.json`;
  document.body.appendChild(a); a.click(); a.remove();

  const n = out.courses.reduce((s, c) => s + c.assignments.length, 0);
  console.log(`done: ${out.courses.length} courses, ${n} assignments -> ${a.download}`);
  return out;
})();
