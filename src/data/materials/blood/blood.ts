import type { MaterialItem } from '../../../types/materials';

import centralData from './central/central.json';
import anatomyData from './anatomy/anatomy.json';
import physiologyData from './physiology/physiology.json';
import histologyData from './histology/histology.json';
import biochemistryData from './biochemistry/biochemistry.json';
import pharmacologyData from './pharmacology/pharmacology.json';
import pathologyData from './pathology/pathology.json';
import parasitologyData from './parasitology/parasitology.json';
import microbiologyData from './microbiology/microbiology.json';
import clinicalData from './clinical/clinical.json';
import examsData from './exams/exams.json';

/**
 * Year 2 - Blood & Lymphatic System (MED201) Study Materials.
 * Aggregates all modular subject JSON datasets.
 */
export const bloodMaterials: MaterialItem[] = [
  ...(centralData as MaterialItem[]),
  ...(anatomyData as MaterialItem[]),
  ...(physiologyData as MaterialItem[]),
  ...(histologyData as MaterialItem[]),
  ...(biochemistryData as MaterialItem[]),
  ...(pharmacologyData as MaterialItem[]),
  ...(pathologyData as MaterialItem[]),
  ...(parasitologyData as MaterialItem[]),
  ...(microbiologyData as MaterialItem[]),
  ...(clinicalData as MaterialItem[]),
  ...(examsData as MaterialItem[]),
];
