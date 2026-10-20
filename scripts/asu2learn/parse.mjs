import { load } from 'cheerio';

/** Parse HTML metadata only. Never fetch links, images, scripts or media. */
export function parsePage({ mode, html, url }) {
  const $ = load(html || '');
  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const absolute = (value) => { try { return new URL(value, url).href; } catch { return ''; } };
  const links = (element, selector = 'a[href], iframe[src]') => $(element).find(selector).map((_, a) => ({
    title: clean($(a).attr('title') || $(a).text()), url: absolute($(a).attr('href') || $(a).attr('src')),
  })).get();
  if (mode === 'login') return { token: $('#login input[name=logintoken]').val() };
  const authenticated = $('a[href*="login/logout.php"]').length > 0 || $('body').hasClass('loggedin');
  const result = {
    authenticated,
    errors: $('.loginerrors, .loginerrormessage, .alert-danger, .errorbox').map((_, el) => clean($(el).text())).get(),
    loginForm: $('#login input[name=username]').length > 0,
    title: clean($('h1').first().text()),
  };
  if (mode === 'activity') {
    const content = $('#region-main .activity-description, #region-main .generalbox, #region-main .resourcecontent, #region-main .urlworkaround, #region-main .foldertree');
    return { ...result, links: content.toArray().flatMap((el) => links(el)) };
  }
  const activities = [];
  const seen = new Set();
  $('#region-main .activity, #region-main [data-for="cmitem"]').each((_, activity) => {
    const el = $(activity);
    const anchor = el.find('.activityname a[href], a.aalink[href], a.activitytitle[href]').first();
    const activityUrl = absolute(anchor.attr('href'));
    const match = activityUrl.match(/\/mod\/([a-z0-9]+)\/view\.php\?(?:[^#]*&)?id=(\d+)/);
    const id = match?.[2] || el.attr('data-id') || el.attr('id');
    if (!id || seen.has(id)) return;
    seen.add(id);
    const section = el.closest('[data-sectionid], li.section');
    const name = el.find('.instancename, .activityname, .activitytitle').first().clone();
    name.find('.accesshide, .sr-only, .visually-hidden').remove();
    const title = clean(name.text() || anchor.text());
    const hidden = el.hasClass('hidden') || el.hasClass('dimmed') || el.find('.availabilityinfo').text().match(/not available|not available unless|hidden from students/i);
    activities.push({
      id: String(id).replace(/^module-/, ''),
      title,
      type: match?.[1] || el.attr('data-modtype') || '',
      url: match ? activityUrl : '',
      sectionId: section.attr('data-sectionid') || section.attr('id') || '',
      section: clean(section.find('.sectionname, .section-title').first().text()),
      hidden: Boolean(hidden),
      links: links(activity, '.contentwithoutlink a[href], .activity-description a[href], .contentwithoutlink iframe[src], .activity-description iframe[src]'),
    });
  });
  const sectionLinks = $('#region-main a[href*="course/section.php"], #region-main a[href*="course/view.php"]').map((_, a) => absolute($(a).attr('href'))).get();
  return { ...result, activities, sectionLinks };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  process.stdout.write(JSON.stringify(parsePage(JSON.parse(input))));
}
