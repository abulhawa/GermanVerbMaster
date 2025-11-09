import type { Word } from '@shared';

export type ApprovalFilter = 'all' | 'approved' | 'pending';
export type CompleteFilter = 'all' | 'complete' | 'incomplete';

export const PER_PAGE_OPTIONS = [25, 50, 100, 200] as const;

export const POS_OPTIONS: Array<{ label: string; value: Word['pos'] | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Verbs', value: 'V' },
  { label: 'Nouns', value: 'N' },
  { label: 'Adjectives', value: 'Adj' },
  { label: 'Adverbs', value: 'Adv' },
  { label: 'Pronouns', value: 'Pron' },
  { label: 'Determiners', value: 'Det' },
  { label: 'Prepositions', value: 'Präp' },
  { label: 'Conjunctions', value: 'Konj' },
  { label: 'Numbers', value: 'Num' },
  { label: 'Particles', value: 'Part' },
  { label: 'Interjections', value: 'Interj' },
];

export const LEVEL_OPTIONS = ['All', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export const APPROVAL_FILTER_OPTIONS: Array<{ label: string; value: ApprovalFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Approved', value: 'approved' },
  { label: 'Pending', value: 'pending' },
];

export const COMPLETE_FILTER_OPTIONS: Array<{ label: string; value: CompleteFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Complete', value: 'complete' },
  { label: 'Incomplete', value: 'incomplete' },
];

export const ADMIN_PAGE_IDS = {
  page: 'admin-words-page',
  content: 'admin-words-content',
  headerSection: 'admin-words-header',
  filterCard: 'admin-words-filter-card',
  tokenInput: 'admin-words-token-input',
  searchInput: 'admin-words-search-input',
  filterControls: 'admin-words-filter-controls',
  wordsCard: 'admin-words-table-card',
  tableContainer: 'admin-words-table-container',
  pagination: 'admin-words-pagination',
} as const;

export const PAGE_DEBUG_ID = 'admin-words';

export interface EditFieldConfig {
  key:
    | 'level'
    | 'english'
    | 'exampleDe'
    | 'exampleEn'
    | 'gender'
    | 'plural'
    | 'separable'
    | 'aux'
    | 'praesensIch'
    | 'praesensEr'
    | 'praeteritum'
    | 'partizipIi'
    | 'perfekt'
    | 'comparative'
    | 'superlative';
  label: string;
  type?: 'text' | 'textarea' | 'select';
  options?: Array<{ label: string; value: string }>;
}

export const COMMON_FIELDS: EditFieldConfig[] = [
  { key: 'level', label: 'Level' },
  { key: 'english', label: 'English' },
  { key: 'exampleDe', label: 'Example (DE)', type: 'textarea' },
  { key: 'exampleEn', label: 'Example (EN)', type: 'textarea' },
];

export const VERB_FIELDS: EditFieldConfig[] = [
  {
    key: 'aux',
    label: 'Auxiliary',
    type: 'select',
    options: [
      { label: 'Unset', value: 'unset' },
      { label: 'haben', value: 'haben' },
      { label: 'sein', value: 'sein' },
      { label: 'haben / sein', value: 'haben / sein' },
    ],
  },
  {
    key: 'separable',
    label: 'Separable',
    type: 'select',
    options: [
      { label: 'Unset', value: 'unset' },
      { label: 'Yes', value: 'true' },
      { label: 'No', value: 'false' },
    ],
  },
  { key: 'praesensIch', label: 'Präsens (ich)' },
  { key: 'praesensEr', label: 'Präsens (er/sie/es)' },
  { key: 'praeteritum', label: 'Präteritum' },
  { key: 'partizipIi', label: 'Partizip II' },
  { key: 'perfekt', label: 'Perfekt' },
];

export const NOUN_FIELDS: EditFieldConfig[] = [
  { key: 'gender', label: 'Gender / Artikel' },
  { key: 'plural', label: 'Plural' },
];

export const ADJECTIVE_FIELDS: EditFieldConfig[] = [
  { key: 'comparative', label: 'Comparative' },
  { key: 'superlative', label: 'Superlative' },
];

export interface AdminWordFilters {
  search: string;
  pos: Word['pos'] | 'ALL';
  level: string;
  approvalFilter: ApprovalFilter;
  completeFilter: CompleteFilter;
  page: number;
  perPage: number;
}
