import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useLocale, useTranslations, isSupportedLocale } from '@/locales';

interface LanguageToggleProps {
  className?: string;
  debugId?: string;
}

export function LanguageToggle({ className, debugId }: LanguageToggleProps) {
  const { locale, setLocale } = useLocale();
  const { languageToggle } = useTranslations();

  const handleChange = (value: string) => {
    if (isSupportedLocale(value)) {
      setLocale(value);
    }
  };

  return (
    <Select value={locale} onValueChange={handleChange}>
      <SelectTrigger
        data-testid="language-toggle"
        aria-label={languageToggle.label}
        className={cn('w-[140px] rounded-2xl border-border/60 bg-background/90 text-sm', className)}
        data-debug-id={debugId}
      >
        <SelectValue placeholder={languageToggle.label} />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="en">{languageToggle.english}</SelectItem>
        <SelectItem value="de">{languageToggle.german}</SelectItem>
      </SelectContent>
    </Select>
  );
}
