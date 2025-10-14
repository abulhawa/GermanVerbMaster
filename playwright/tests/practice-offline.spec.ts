import { expect, test } from '@playwright/test';

const nounTaskPayload = {
  taskId: 'task:de:noun:kind:dative',
  taskType: 'noun_case_declension',
  renderer: 'noun_case_declension',
  pos: 'noun',
  prompt: {
    lemma: 'Kind',
    pos: 'noun',
    gender: 'das',
    requestedCase: 'dative',
    requestedNumber: 'plural',
    instructions: 'Setze „Kind“ in den Dativ Plural mit Artikel.',
    cefrLevel: 'A2',
  },
  solution: {
    form: 'Kindern',
    article: 'den',
  },
  queueCap: 25,
  lexeme: {
    id: 'lex:de:noun:kind',
    lemma: 'Kind',
    metadata: { english: 'child', level: 'A2' },
  },
  pack: {
    id: 'pack:nouns-foundation:1',
    slug: 'nouns-foundation',
    name: 'Nouns – Foundation',
  },
};

const practiceSettings = {
  version: 1,
  defaultTaskType: 'noun_case_declension',
  preferredTaskTypes: ['noun_case_declension'],
  cefrLevelByPos: { verb: 'A1', noun: 'A2' },
  rendererPreferences: {
    conjugate_form: { showHints: true, showExamples: true },
    noun_case_declension: { showHints: true, showExamples: true },
    adj_ending: { showHints: true, showExamples: true },
  },
  legacyVerbLevel: 'A1',
  migratedFromLegacy: true,
  updatedAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
};

test.describe('noun practice offline queue', () => {
  test('accepts "den Kindern" and queues when the submission endpoint fails', async ({ page }) => {
await page.addInitScript((settings) => {
  localStorage.setItem('practice.settings', JSON.stringify(settings));
  localStorage.setItem('practice.settings.migrated', '1');
  localStorage.removeItem('practice.session');
  localStorage.removeItem('practice.progress');
  localStorage.removeItem('practice.answers');
}, practiceSettings);
await page.addInitScript((task) => {
  const tasks = [task];
  const originalFetch = window.fetch.bind(window);
  (window as typeof window & { __submissionAttempts?: number }).__submissionAttempts = 0;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('/api/tasks')) {
      return new Response(JSON.stringify({ tasks }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/submission')) {
      const globalObj = window as typeof window & { __submissionAttempts?: number };
      globalObj.__submissionAttempts = (globalObj.__submissionAttempts ?? 0) + 1;
      return new Response(JSON.stringify({ error: 'test-failure' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  };
}, nounTaskPayload);

    await page.goto('/');

    const card = page.getByTestId('practice-card');
    await expect(card).toBeVisible();
    await expect(card.getByText(/^NOUN$/)).toBeVisible();

    await page.getByLabel('Enter plural form', { exact: false }).fill('den Kindern');
    const input = page.getByLabel('Enter plural form', { exact: false });
    await page.getByRole('button', { name: /check/i }).click();

    await expect(input).toBeDisabled();
    await expect(page.getByText(/Saved offline/i)).toBeVisible();
    const attempts = await page.evaluate(() => (window as typeof window & { __submissionAttempts?: number }).__submissionAttempts ?? 0);
    expect(attempts).toBeGreaterThan(0);
  });

  test('switching locale updates practice card labels', async ({ page }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('practice.settings', JSON.stringify(settings));
      localStorage.setItem('practice.settings.migrated', '1');
      localStorage.removeItem('practice.session');
      localStorage.removeItem('practice.progress');
      localStorage.removeItem('practice.answers');
    }, practiceSettings);

    await page.addInitScript((task) => {
      const tasks = [task];
      const originalFetch = window.fetch.bind(window);

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/api/tasks')) {
          return new Response(JSON.stringify({ tasks }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(input, init);
      };
    }, nounTaskPayload);

    await page.goto('/');

    const card = page.getByTestId('practice-card');
    await expect(card).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check' })).toBeVisible();
    await expect(page.getByLabel('Enter plural form', { exact: false })).toBeVisible();
    await expect(card).toContainText('Give the Dativ Plural form of "Kind"');

    await page.evaluate(() => {
      localStorage.setItem('gvm.locale', 'de');
    });
    await page.reload();

    const germanCard = page.getByTestId('practice-card');
    await expect(germanCard).toBeVisible();

    await expect(page.getByRole('button', { name: 'Prüfen' })).toBeVisible();
    await expect(page.getByLabel('Pluralform eingeben', { exact: false })).toBeVisible();
    await expect(germanCard).toContainText('Bilde die Dativ Plural-Form von „Kind“');
  });
});
