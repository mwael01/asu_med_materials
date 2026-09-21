import type { MaterialItem, FilterOptions } from '../types/materials';

export function filterMaterials(
  materials: MaterialItem[],
  options: FilterOptions
): MaterialItem[] {
  const query = options.query?.trim().toLowerCase() ?? '';
  const year = options.year;
  const type = options.type;
  const moduleId = options.moduleId;
  const subject = options.subject?.trim().toLowerCase();

  return materials.filter((item) => {
    // Filter by Academic Year
    if (year && year !== 'all' && item.year !== year) {
      return false;
    }

    // Filter by Resource Type
    if (type && type !== 'all' && item.type !== type) {
      return false;
    }

    // Filter by Module ID
    if (moduleId && item.moduleId !== moduleId) {
      return false;
    }

    // Filter by Subject
    if (subject && item.subject?.toLowerCase() !== subject) {
      return false;
    }

    // Text search matching against title, description, author, subject, tags
    if (query) {
      const inTitle = item.title.toLowerCase().includes(query);
      const inDescription = item.description?.toLowerCase().includes(query) ?? false;
      const inSubject = item.subject?.toLowerCase().includes(query) ?? false;
      const authorText = Array.isArray(item.author)
        ? item.author.join(' ')
        : (item.author ?? '');
      const inAuthor = authorText.toLowerCase().includes(query);
      const inTags = item.tags.some((tag) => tag.toLowerCase().includes(query));

      if (!inTitle && !inDescription && !inSubject && !inAuthor && !inTags) {
        return false;
      }
    }

    return true;
  });
}
