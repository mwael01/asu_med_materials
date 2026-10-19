/** Independent assignments allow a single material to serve several subjects/lessons. */
export interface MaterialLessonLink {
  id: string;
  materialId: string;
  lessonId: string;
  moduleId: string;
}
