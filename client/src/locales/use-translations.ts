import { useMemo } from 'react';

import { getMessages } from './messages';
import { useLocale } from './locale-context';

export function useTranslations() {
  const { locale } = useLocale();
  return useMemo(() => getMessages(locale), [locale]);
}
